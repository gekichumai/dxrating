import { describe, expect, it, vi } from 'vitest'
import { CatalogIdentityError, type CatalogIdentityQuery, createCatalogIdentityService } from './catalog-identities.js'

const SONG_A = 'dsng_23456789ab'
const SONG_B = 'dsng_23456789ac'
const SHEET_A = 'dsht_23456789ab'
const SHEET_B = 'dsht_23456789ac'

const row = (
  catalogRunId = '1',
  overrides: Partial<{
    public_song_id: string
    legacy_song_id: string | null
    legacy_song_ids: string[]
    publication_revision: string
    public_sheet_id: string | null
    sheet_type: string | null
    sheet_difficulty: string | null
  }> = {},
) => ({
  catalog_run_id: catalogRunId,
  publication_revision: '1',
  public_song_id: SONG_A,
  legacy_song_id: 'legacy-song-a',
  legacy_song_ids: ['legacy-song-a'],
  public_sheet_id: SHEET_A,
  sheet_type: 'dx',
  sheet_difficulty: 'master',
  ...overrides,
})

const staticCatalogQuery = (rows: unknown[], catalogRunId = '1', publicationRevision = '1') =>
  vi.fn<CatalogIdentityQuery>(async (text) => {
    if (text.includes('catalog_song.song_id AS public_song_id')) return { rows }
    return { rows: [{ catalog_run_id: catalogRunId, publication_revision: publicationRevision }] }
  })

const expectCatalogError = async (promise: Promise<unknown>, code: CatalogIdentityError['code']) => {
  await expect(promise).rejects.toMatchObject({
    name: 'CatalogIdentityError',
    code,
  })
}

describe('catalog identity service', () => {
  it('passes legacy song and sheet identities through when the catalog schema is unavailable', async () => {
    const query = vi.fn<CatalogIdentityQuery>(async () => {
      throw new Error('catalog schema unavailable')
    })
    const identities = createCatalogIdentityService(query)

    await expect(identities.resolveSongInput('legacy-song-a')).resolves.toEqual({
      legacySongId: 'legacy-song-a',
      legacySongIds: ['legacy-song-a'],
    })
    await expect(
      identities.resolveSheetInput({
        songId: 'legacy-song-a',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      }),
    ).resolves.toEqual({
      legacySongId: 'legacy-song-a',
      legacySongIds: ['legacy-song-a'],
      sheetType: 'dx',
      sheetDifficulty: 'master',
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('passes unmapped legacy song and sheet identities through unchanged', async () => {
    const query = staticCatalogQuery([row()])
    const identities = createCatalogIdentityService(query)

    await expect(identities.resolveSongInput('unmapped-legacy-song')).resolves.toEqual({
      legacySongId: 'unmapped-legacy-song',
      legacySongIds: ['unmapped-legacy-song'],
    })
    await expect(
      identities.resolveSheetInput({
        songId: 'legacy-song-a',
        sheetType: 'std',
        sheetDifficulty: 'master',
      }),
    ).resolves.toEqual({
      legacySongId: 'legacy-song-a',
      legacySongIds: ['legacy-song-a'],
      sheetType: 'std',
      sheetDifficulty: 'master',
    })
  })

  it('resolves a current public song and sheet to legacy persistence identities', async () => {
    const query = staticCatalogQuery([row()])
    const identities = createCatalogIdentityService(query)

    await expect(identities.resolveSongInput(SONG_A)).resolves.toEqual({
      legacySongId: 'legacy-song-a',
      legacySongIds: ['legacy-song-a'],
      publicSongId: SONG_A,
    })
    await expect(
      identities.resolveSheetInput({
        songId: SONG_A,
        sheetId: SHEET_A,
        sheetType: 'dx',
        sheetDifficulty: 'master',
      }),
    ).resolves.toEqual({
      legacySongId: 'legacy-song-a',
      legacySongIds: ['legacy-song-a'],
      publicSongId: SONG_A,
      publicSheetId: SHEET_A,
      sheetType: 'dx',
      sheetDifficulty: 'master',
    })

    const pointerQueries = query.mock.calls.filter(([text]) => !text.includes('public_song_id'))
    const snapshotQueries = query.mock.calls.filter(([text]) => text.includes('public_song_id'))
    expect(pointerQueries).toHaveLength(2)
    expect(snapshotQueries).toHaveLength(1)
    expect(pointerQueries[0][0]).toContain('dxdata.catalog_publications')
    expect(pointerQueries[0][0]).toContain('dxdata.catalog_snapshots')
    expect(pointerQueries[0][0]).toContain('dxdata.catalog_build_runs')
    expect(snapshotQueries[0][0]).toContain('dxdata.catalog_run_songs')
    expect(snapshotQueries[0][0]).toContain('dxdata.canonical_songs')
    expect(snapshotQueries[0][0]).toContain('dxdata.song_source_mappings')
    expect(snapshotQueries[0][0]).toContain('dxdata.catalog_run_sheets')
    expect(snapshotQueries[0][0]).toContain('dxdata.canonical_sheets')
    expect(snapshotQueries[0][0]).toContain('publication.catalog_run_id = $2::bigint')
    expect(snapshotQueries[0][0]).toContain("catalog_run.status = 'published'")
    expect(snapshotQueries[0][0]).toContain('publication.revision = $3::bigint')
    expect(snapshotQueries[0][0]).toContain('snapshot.api_schema_version = $4')
    expect(snapshotQueries[0][0]).not.toContain('legacy_mapping.active')
  })

  it('fails closed for malformed reserved public IDs before querying PostgreSQL', async () => {
    const query = vi.fn<CatalogIdentityQuery>()
    const identities = createCatalogIdentityService(query)

    await expectCatalogError(identities.resolveSongInput('dsng_not-valid'), 'bad_request')
    await expectCatalogError(
      identities.resolveSheetInput({
        songId: 'legacy-song-a',
        sheetId: 'legacy-looking-sheet-id',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      }),
      'bad_request',
    )
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects public IDs that are not members of the current publication', async () => {
    const identities = createCatalogIdentityService(staticCatalogQuery([row()]))

    await expectCatalogError(identities.resolveSongInput(SONG_B), 'not_found')
    await expectCatalogError(
      identities.resolveSheetInput({
        songId: SONG_A,
        sheetId: SHEET_B,
        sheetType: 'dx',
        sheetDifficulty: 'master',
      }),
      'not_found',
    )
  })

  it('rejects a published sheet ID that disagrees with the song or chart tuple', async () => {
    const identities = createCatalogIdentityService(
      staticCatalogQuery([
        row(),
        row('1', {
          public_song_id: SONG_B,
          legacy_song_id: 'legacy-song-b',
          legacy_song_ids: ['legacy-song-b'],
          public_sheet_id: SHEET_B,
        }),
      ]),
    )

    await expectCatalogError(
      identities.resolveSheetInput({
        songId: SONG_A,
        sheetId: SHEET_B,
        sheetType: 'dx',
        sheetDifficulty: 'master',
      }),
      'not_found',
    )
    await expectCatalogError(
      identities.resolveSheetInput({
        songId: SONG_A,
        sheetId: SHEET_A,
        sheetType: 'std',
        sheetDifficulty: 'master',
      }),
      'not_found',
    )
  })

  it('drops orphaned legacy associations when producing public list responses', async () => {
    const identities = createCatalogIdentityService(
      staticCatalogQuery([
        row(),
        row('1', {
          public_song_id: SONG_B,
          legacy_song_id: 'dsng_bad',
          legacy_song_ids: ['dsng_bad'],
          public_sheet_id: SHEET_B,
        }),
      ]),
    )

    const songIds = await identities.translateSongIdsToPublic(['legacy-song-a', 'retired-song', SONG_A, 'dsng_bad'])
    expect([...songIds]).toEqual([
      ['legacy-song-a', SONG_A],
      [SONG_A, SONG_A],
    ])

    await expect(
      identities.translateTagSongsToPublic([
        {
          song_id: 'legacy-song-a',
          sheet_type: 'dx',
          sheet_difficulty: 'master',
          tag_id: 1,
        },
        {
          song_id: 'retired-song',
          sheet_type: 'dx',
          sheet_difficulty: 'master',
          tag_id: 2,
        },
      ]),
    ).resolves.toEqual([
      {
        song_id: SONG_A,
        sheet_id: SHEET_A,
        sheet_type: 'dx',
        sheet_difficulty: 'master',
        tag_id: 1,
      },
    ])
  })

  it('uses every historical legacy mapping for reads while retaining the current write identity', async () => {
    const identities = createCatalogIdentityService(
      staticCatalogQuery([
        row('1', {
          legacy_song_id: 'legacy-song-current',
          legacy_song_ids: ['legacy-song-current', 'legacy-song-retired'],
        }),
      ]),
    )

    await expect(identities.resolveSongInput(SONG_A)).resolves.toEqual({
      legacySongId: 'legacy-song-current',
      legacySongIds: ['legacy-song-current', 'legacy-song-retired'],
      publicSongId: SONG_A,
    })
    await expect(identities.resolveSongInput('legacy-song-retired')).resolves.toEqual({
      legacySongId: 'legacy-song-current',
      legacySongIds: ['legacy-song-current', 'legacy-song-retired'],
      publicSongId: SONG_A,
    })
    await expect(
      identities.resolveSheetInput({
        songId: 'legacy-song-current',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      }),
    ).resolves.toEqual({
      legacySongId: 'legacy-song-current',
      legacySongIds: ['legacy-song-current', 'legacy-song-retired'],
      publicSongId: SONG_A,
      publicSheetId: SHEET_A,
      sheetType: 'dx',
      sheetDifficulty: 'master',
    })
    await expect(
      identities.resolveSheetInput({
        songId: 'legacy-song-retired',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      }),
    ).resolves.toMatchObject({
      legacySongId: 'legacy-song-current',
      legacySongIds: ['legacy-song-current', 'legacy-song-retired'],
      publicSheetId: SHEET_A,
    })
    await expect(identities.translateSongIdsToPublic(['legacy-song-retired'])).resolves.toEqual(
      new Map([['legacy-song-retired', SONG_A]]),
    )
    await expect(
      identities.translateTagSongsToPublic([
        {
          song_id: 'legacy-song-retired',
          sheet_type: 'dx',
          sheet_difficulty: 'master',
          tag_id: 1,
        },
        {
          song_id: 'legacy-song-current',
          sheet_type: 'dx',
          sheet_difficulty: 'master',
          tag_id: 1,
        },
      ]),
    ).resolves.toEqual([
      {
        song_id: SONG_A,
        sheet_id: SHEET_A,
        sheet_type: 'dx',
        sheet_difficulty: 'master',
        tag_id: 1,
      },
    ])
  })

  it('aggregates historical and current event identities before ranking public trends', async () => {
    const identities = createCatalogIdentityService(
      staticCatalogQuery([
        row('1', {
          legacy_song_ids: ['legacy-song-a', 'legacy-song-a-retired'],
        }),
        row('1', {
          public_song_id: SONG_B,
          legacy_song_id: 'legacy-song-b',
          legacy_song_ids: ['legacy-song-b'],
          public_sheet_id: SHEET_B,
        }),
      ]),
    )

    await expect(
      identities.translateSongCountsToPublic([
        { songId: 'legacy-song-b', count: 10 },
        { songId: 'legacy-song-a', count: 5 },
        { songId: 'legacy-song-a-retired', count: 6 },
        { songId: 'retired-orphan', count: 100 },
      ]),
    ).resolves.toEqual([
      { songId: SONG_A, count: 11 },
      { songId: SONG_B, count: 10 },
    ])
  })

  it('fails closed when a legacy mapping aliases two current canonical songs', async () => {
    const identities = createCatalogIdentityService(
      staticCatalogQuery([
        row('1', { legacy_song_ids: ['shared-legacy-id'] }),
        row('1', {
          public_song_id: SONG_B,
          legacy_song_id: 'legacy-song-b',
          legacy_song_ids: ['shared-legacy-id'],
          public_sheet_id: SHEET_B,
        }),
      ]),
    )

    await expectCatalogError(identities.translateSongIdsToPublic(['shared-legacy-id']), 'unavailable')
  })

  it('treats a published song without a legacy mapping as an unavailable compatibility invariant', async () => {
    const identities = createCatalogIdentityService(staticCatalogQuery([row('1', { legacy_song_id: null })]))
    await expectCatalogError(identities.resolveSongInput(SONG_A), 'unavailable')
  })

  it('checks the publication pointer on every public request and swaps snapshots after a publish', async () => {
    let catalogRunId = '1'
    let publicationRevision = '1'
    const query = vi.fn<CatalogIdentityQuery>(async (text, values) => {
      if (!text.includes('catalog_song.song_id AS public_song_id')) {
        return { rows: [{ catalog_run_id: catalogRunId, publication_revision: publicationRevision }] }
      }
      const requestedRunId = values[1]
      if (requestedRunId === '1') return { rows: [row('1')] }
      return {
        rows: [
          row('2', {
            public_song_id: SONG_B,
            legacy_song_id: 'legacy-song-a',
            legacy_song_ids: ['legacy-song-a'],
            publication_revision: '2',
            public_sheet_id: SHEET_B,
          }),
        ],
      }
    })
    const identities = createCatalogIdentityService(query)

    await expect(identities.translateSongIdsToPublic(['legacy-song-a'])).resolves.toEqual(
      new Map([['legacy-song-a', SONG_A]]),
    )
    catalogRunId = '2'
    publicationRevision = '2'
    await expect(identities.translateSongIdsToPublic(['legacy-song-a'])).resolves.toEqual(
      new Map([['legacy-song-a', SONG_B]]),
    )

    expect(query.mock.calls.filter(([text]) => !text.includes('public_song_id'))).toHaveLength(2)
    expect(query.mock.calls.filter(([text]) => text.includes('public_song_id'))).toHaveLength(2)
  })

  it('refreshes identities when the same catalog run is republished at a newer revision', async () => {
    let publicationRevision = '1'
    const query = vi.fn<CatalogIdentityQuery>(async (text, values) => {
      if (!text.includes('catalog_song.song_id AS public_song_id')) {
        return { rows: [{ catalog_run_id: '1', publication_revision: publicationRevision }] }
      }
      const requestedRevision = String(values[2])
      return {
        rows: [
          row('1', {
            publication_revision: requestedRevision,
            legacy_song_id: requestedRevision === '1' ? 'legacy-song-old' : 'legacy-song-current',
            legacy_song_ids:
              requestedRevision === '1' ? ['legacy-song-old'] : ['legacy-song-current', 'legacy-song-old'],
          }),
        ],
      }
    })
    const identities = createCatalogIdentityService(query)

    await expect(identities.resolveSongInput(SONG_A)).resolves.toMatchObject({ legacySongId: 'legacy-song-old' })
    publicationRevision = '2'
    await expect(identities.resolveSongInput(SONG_A)).resolves.toMatchObject({
      legacySongId: 'legacy-song-current',
      legacySongIds: ['legacy-song-current', 'legacy-song-old'],
    })

    expect(query.mock.calls.filter(([text]) => text.includes('public_song_id'))).toHaveLength(2)
  })

  it('does not let an older in-flight revision replace a newer completed snapshot', async () => {
    let publicationRevision = '1'
    let releaseOldSnapshot!: () => void
    const oldSnapshotGate = new Promise<void>((resolve) => {
      releaseOldSnapshot = resolve
    })
    const query = vi.fn<CatalogIdentityQuery>(async (text, values) => {
      if (!text.includes('catalog_song.song_id AS public_song_id')) {
        return { rows: [{ catalog_run_id: '1', publication_revision: publicationRevision }] }
      }
      const requestedRevision = String(values[2])
      if (requestedRevision === '1') await oldSnapshotGate
      return {
        rows: [
          row('1', {
            publication_revision: requestedRevision,
            legacy_song_id: requestedRevision === '1' ? 'legacy-song-old' : 'legacy-song-current',
            legacy_song_ids:
              requestedRevision === '1' ? ['legacy-song-old'] : ['legacy-song-current', 'legacy-song-old'],
          }),
        ],
      }
    })
    const identities = createCatalogIdentityService(query)

    const oldRequest = identities.resolveSongInput(SONG_A)
    await vi.waitFor(() => {
      expect(query.mock.calls.some(([text, values]) => text.includes('public_song_id') && values[2] === '1')).toBe(true)
    })
    publicationRevision = '2'
    await expect(identities.resolveSongInput(SONG_A)).resolves.toMatchObject({
      legacySongId: 'legacy-song-current',
    })
    releaseOldSnapshot()
    await expect(oldRequest).resolves.toMatchObject({ legacySongId: 'legacy-song-current' })

    await expect(identities.resolveSongInput(SONG_A)).resolves.toMatchObject({
      legacySongId: 'legacy-song-current',
    })
  })

  it('single-flights a snapshot load while still checking the pointer for each request', async () => {
    let releaseSnapshot!: () => void
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve
    })
    const query = vi.fn<CatalogIdentityQuery>(async (text) => {
      if (!text.includes('catalog_song.song_id AS public_song_id')) {
        return { rows: [{ catalog_run_id: '1', publication_revision: '1' }] }
      }
      await snapshotGate
      return { rows: [row()] }
    })
    const identities = createCatalogIdentityService(query)

    const first = identities.resolveSongInput(SONG_A)
    const second = identities.resolveSongInput(SONG_A)
    await vi.waitFor(() => {
      expect(query.mock.calls.filter(([text]) => !text.includes('public_song_id'))).toHaveLength(2)
    })
    releaseSnapshot()
    await Promise.all([first, second])

    expect(query.mock.calls.filter(([text]) => text.includes('public_song_id'))).toHaveLength(1)
  })
})