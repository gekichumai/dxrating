import { describe, expect, it } from 'vitest'
import type { OpenAPI } from '@orpc/openapi'
import { PublishedDxdataCatalogSchema, addPublishedDxdataToOpenApi } from './dxdata-openapi.js'

const catalogFixture = {
  schemaVersion: 1,
  updatedAt: '2026-08-01T00:00:00Z',
  categories: [],
  versions: [],
  types: [],
  difficulties: [],
  servers: [],
  songs: [
    {
      id: 'dsng_23456789ab',
      category: 'maimai',
      title: 'Contract song',
      artist: '',
      imageName: 'contract.png',
      version: 'CiRCLE PLUS',
      isNew: false,
      isLocked: false,
      sheets: [
        {
          id: 'dsht_23456789ab',
          type: 'dx',
          difficulty: 'master',
          level: '14',
          internalLevelValue: 14,
          noteCounts: {},
          serverIds: ['jp'],
          isSpecial: false,
          version: 'CiRCLE PLUS',
        },
      ],
      searchAcronyms: [],
    },
  ],
  tagGroups: [
    {
      id: 1,
      localized_name: { ja: 'グループ' },
      color: '#ff00aa',
    },
  ],
  tags: [
    {
      id: 2,
      localized_name: { ja: 'タグ' },
      localized_description: {},
      group_id: 1,
    },
  ],
  tagSongs: [
    {
      song_id: 'dsng_23456789ab',
      sheet_id: 'dsht_23456789ab',
      sheet_type: 'dx',
      sheet_difficulty: 'master',
      tag_id: 2,
    },
  ],
  aliases: [{ song_id: 'dsng_23456789ab', name: 'Contract alias' }],
} as const

describe('published DX data OpenAPI contract', () => {
  it('accepts the null-free public catalog shape and rejects private or nullable fields', () => {
    expect(PublishedDxdataCatalogSchema.parse(catalogFixture)).toEqual(catalogFixture)
    expect(
      PublishedDxdataCatalogSchema.safeParse({
        ...catalogFixture,
        provenance: { source: 'private' },
      }).success,
    ).toBe(false)
    expect(
      PublishedDxdataCatalogSchema.safeParse({
        ...catalogFixture,
        songs: [{ ...catalogFixture.songs[0], bpm: null }],
      }).success,
    ).toBe(false)
    expect(
      PublishedDxdataCatalogSchema.safeParse({
        ...catalogFixture,
        tags: [{ ...catalogFixture.tags[0], group_id: null }],
      }).success,
    ).toBe(false)
  })

  it('adds discoverable GET and HEAD operations without defining a runtime handler', () => {
    const document: OpenAPI.Document = {
      openapi: '3.1.1',
      info: { title: 'test', version: '1' },
      paths: {},
    }

    const augmented = addPublishedDxdataToOpenApi(document)

    expect(augmented.paths?.['/dxdata']?.get).toMatchObject({
      operationId: 'getPublishedDxdataCatalog',
      security: [],
    })
    expect(augmented.paths?.['/dxdata']?.head).toMatchObject({
      operationId: 'headPublishedDxdataCatalog',
      security: [],
    })
    expect(augmented.paths?.['/dxdata']?.get?.responses['503']).toHaveProperty('content.application/json')
    expect(augmented.paths?.['/dxdata']?.head?.responses['500']).not.toHaveProperty('content')
    expect(augmented.paths?.['/dxdata']?.head?.responses['503']).not.toHaveProperty('content')
    expect(augmented.components?.schemas?.PublishedDxdataCatalog).toBeDefined()
  })

  it('documents concise real-data examples for the catalog, headers, validators, and errors', () => {
    const document: OpenAPI.Document = {
      openapi: '3.1.1',
      info: { title: 'test', version: '1' },
      paths: {},
    }

    const augmented = addPublishedDxdataToOpenApi(document)
    const catalogSchema = augmented.components?.schemas?.PublishedDxdataCatalog as OpenAPI.SchemaObject
    const [catalogExample] = catalogSchema.examples ?? []
    const parsedExample = PublishedDxdataCatalogSchema.parse(catalogExample)

    for (const collection of [
      parsedExample.categories,
      parsedExample.versions,
      parsedExample.types,
      parsedExample.difficulties,
      parsedExample.servers,
      parsedExample.songs,
      parsedExample.tagGroups,
      parsedExample.tags,
      parsedExample.tagSongs,
      parsedExample.aliases,
    ]) {
      expect(collection.length).toBeGreaterThan(0)
      expect(collection.length).toBeLessThanOrEqual(3)
    }
    for (const song of parsedExample.songs) {
      expect(song.sheets.length).toBeGreaterThan(0)
      expect(song.sheets.length).toBeLessThanOrEqual(3)
      expect(song.searchAcronyms.length).toBeLessThanOrEqual(3)
      for (const sheet of song.sheets) {
        expect(sheet.serverIds.length).toBeLessThanOrEqual(3)
        expect(Object.keys(sheet.multiverInternalLevelValue ?? {}).length).toBeLessThanOrEqual(3)
      }
    }

    const get = augmented.paths?.['/dxdata']?.get
    const successResponse = get?.responses['200'] as OpenAPI.ResponseObject
    const mediaExample = successResponse.content?.['application/json']?.examples?.representativeCatalog
    expect(mediaExample).not.toHaveProperty('$ref')
    expect(mediaExample).toHaveProperty('value', parsedExample)

    const headers = successResponse.headers as Record<string, OpenAPI.HeaderObject>
    for (const header of Object.values(headers)) {
      expect(header.example).toBeDefined()
      expect(header.example).not.toBe('string')
    }

    const validator = get?.parameters?.[0] as OpenAPI.ParameterObject
    const validatorExamples = Object.values(validator.examples ?? {}).map((example) =>
      '$ref' in example ? undefined : example.value,
    )
    expect(validatorExamples).toEqual([
      '"78af90bc0094b4167143fabea17666892ec38c8de7723254fd74d3389da648e2"',
      'W/"78af90bc0094b4167143fabea17666892ec38c8de7723254fd74d3389da648e2"',
      '*',
    ])

    const internalError = get?.responses['500'] as OpenAPI.ResponseObject
    const unavailableError = get?.responses['503'] as OpenAPI.ResponseObject
    const internalErrorExample = internalError.content?.['application/json']?.examples?.error
    const unavailableErrorExample = unavailableError.content?.['application/json']?.examples?.error
    expect(internalErrorExample).toHaveProperty('value', {
      error: 'Internal server error',
    })
    expect(unavailableErrorExample).toHaveProperty('value', {
      error: 'DX data catalog is unavailable',
    })

    expect(
      JSON.stringify({
        catalogExample,
        headerExamples: Object.values(headers).map((header) => header.example),
        validatorExamples,
        internalErrorExample,
        unavailableErrorExample,
      }),
    ).not.toContain('"string"')
  })
})