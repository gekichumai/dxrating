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
    expect(augmented.components?.schemas?.PublishedDxdataCatalog).toBeDefined()
  })
})