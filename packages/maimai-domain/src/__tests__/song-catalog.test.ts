import {
  CategoryEnum,
  DifficultyEnum,
  ServerEnum,
  TypeEnum,
  VersionEnum,
  type Sheet,
  type Song,
} from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { LEGACY_SONG_IDS } from '@gekichumai/dxdata/legacy-song-ids'
import { describe, expect, it } from 'vitest'
import { buildSongCatalog, getSongCatalog, type SongCatalogSource } from '../song-catalog'

const sheet = (overrides: Partial<Sheet> & Pick<Sheet, 'id'>): Sheet => ({
  type: TypeEnum.DX,
  difficulty: DifficultyEnum.Master,
  level: '13',
  internalLevelValue: 13,
  noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
  serverIds: [ServerEnum.JP, ServerEnum.INTL, ServerEnum.USA],
  isSpecial: false,
  version: VersionEnum.PRiSMPLUS,
  ...overrides,
})

const song = (overrides: Partial<Song> & Pick<Song, 'id' | 'title' | 'sheets'>): Song => ({
  artist: 'Artist',
  bpm: 180,
  category: CategoryEnum.Maimai,
  imageName: overrides.id,
  version: VersionEnum.PRiSMPLUS,
  isNew: false,
  isLocked: false,
  searchAcronyms: [],
  ...overrides,
})

const fixtureData: SongCatalogSource = {
  versions: [],
  songs: [
    song({
      id: 'dsng_songa00000',
      title: 'Song A',
      searchAcronyms: ['sa'],
      sheets: [
        sheet({
          id: 'dsht_songadxmas',
          internalId: 10001,
          level: '13+',
          internalLevelValue: 13.7,
          multiverInternalLevelValue: { [VersionEnum.CiRCLE]: 13.8 },
          noteDesigner: 'Designer',
          releaseDate: '2025-03-01',
        }),
        sheet({
          id: 'dsht_songautage',
          internalId: 20001,
          type: TypeEnum.UTAGE,
          level: '宴',
          internalLevelValue: 0,
          noteCounts: {},
          serverIds: [ServerEnum.JP],
          isSpecial: true,
        }),
      ],
    }),
  ],
}

const SONG_A_DX_MASTER = { songId: 'dsng_songa00000', type: TypeEnum.DX, difficulty: DifficultyEnum.Master } as const

describe('Song Catalog', () => {
  it('projects Versioned Sheets with public IDs, identity, and the selected internal level', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const versioned = catalog.getByIdentity(SONG_A_DX_MASTER)

    expect(versioned?.id).toBe('dsht_songadxmas')
    expect(versioned?.songId).toBe('dsng_songa00000')
    expect(versioned?.identity).toEqual(SONG_A_DX_MASTER)
    expect(versioned?.title).toBe('Song A')
    expect(versioned?.version).toBe(VersionEnum.PRiSMPLUS)
    expect(versioned?.internalLevelValue).toBe(13.8)
    expect(versioned?.releaseDateTimestamp).toBe(new Date('2025-03-01T06:00:00+09:00').valueOf())
    expect(catalog.getById('dsht_songadxmas')).toBe(versioned)
    expect(catalog.getSong('dsng_songa00000')?.title).toBe('Song A')
  })

  it('does not copy the song sheet list into every sheet', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)

    expect(catalog.sheets.every((versioned) => !('sheets' in versioned))).toBe(true)
  })

  it('marks UTAGE sheets as not rating eligible', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const versioned = catalog.getById('dsht_songautage')

    expect(versioned?.isTypeUtage).toBe(true)
    expect(versioned?.isRatingEligible).toBe(false)
  })

  it('falls back missing release dates to the latest known date in that version', () => {
    const catalog = buildSongCatalog(
      {
        ...fixtureData,
        songs: [
          song({
            id: 'dsng_dated00000',
            title: 'Dated Song',
            sheets: [sheet({ id: 'dsht_dated00000', version: VersionEnum.CiRCLE, releaseDate: '2026-03-05' })],
          }),
          song({
            id: 'dsng_bring00000',
            title: 'Bring it on',
            isNew: true,
            sheets: [sheet({ id: 'dsht_bring00000', version: VersionEnum.CiRCLE })],
          }),
          song({
            id: 'dsng_older00000',
            title: 'Older Song',
            sheets: [sheet({ id: 'dsht_older00000', version: VersionEnum.CiRCLE, releaseDate: '2025-09-18' })],
          }),
        ],
      },
      VersionEnum.CiRCLE,
    )

    const undated = catalog.getById('dsht_bring00000')
    const latestDated = catalog.getById('dsht_dated00000')
    const older = catalog.getById('dsht_older00000')

    // Same sort key as the newest known CiRCLE chart (not epoch / null).
    expect(undated?.releaseDateTimestamp).toBe(latestDated?.releaseDateTimestamp)
    expect(undated?.releaseDateTimestamp).toBe(new Date('2026-03-05T06:00:00+09:00').valueOf())
    expect((undated?.releaseDateTimestamp ?? 0) > (older?.releaseDateTimestamp ?? 0)).toBe(true)
  })

  it('falls back to the version launch date when no sheet of that version is dated', () => {
    const catalog = buildSongCatalog(
      {
        versions: [{ version: VersionEnum.MAGiCAL, releaseDate: '2026-09-17' }],
        songs: [
          song({
            id: 'dsng_magic00000',
            title: 'M',
            sheets: [sheet({ id: 'dsht_magic00000', version: VersionEnum.MAGiCAL })],
          }),
        ],
      },
      VersionEnum.MAGiCAL,
    )

    expect(catalog.sheets[0]?.releaseDateTimestamp).toBe(new Date('2026-09-17T06:00:00+09:00').valueOf())
  })

  it('resolves explicit provider references without fuzzy matching', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)

    expect(
      catalog.resolveReference({ kind: 'title', title: 'Song A', type: TypeEnum.DX, difficulty: DifficultyEnum.Master })
        ?.id,
    ).toBe('dsht_songadxmas')
    expect(
      catalog.resolveReference({
        kind: 'internal-id',
        internalId: 10001,
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      })?.id,
    ).toBe('dsht_songadxmas')
    expect(
      catalog.resolveReference({ kind: 'title', title: 'Song', type: TypeEnum.DX, difficulty: DifficultyEnum.Master }),
    ).toBeNull()
  })

  it('returns null for ambiguous exact title references', () => {
    const catalog = buildSongCatalog(
      {
        ...fixtureData,
        songs: [
          ...fixtureData.songs,
          song({
            id: 'dsng_songb00000',
            title: 'Song A',
            sheets: [sheet({ id: 'dsht_songbdxmas', internalId: 10002 })],
          }),
        ],
      },
      VersionEnum.CiRCLE,
    )

    expect(
      catalog.resolveReference({
        kind: 'title',
        title: 'Song A',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBeNull()
  })

  it('resolves provider music ids by internal id before ambiguous title fallback', () => {
    const catalog = buildSongCatalog(
      {
        ...fixtureData,
        songs: [
          { ...fixtureData.songs[0]!, title: 'Shared Title' },
          song({
            id: 'dsng_songb00000',
            title: 'Shared Title',
            sheets: [sheet({ id: 'dsht_songbdxmas', internalId: 10002 })],
          }),
        ],
      },
      VersionEnum.CiRCLE,
    )

    expect(
      catalog.resolveReference({ kind: 'provider-music-id', musicId: 10002, difficulty: DifficultyEnum.Master })
        ?.songId,
    ).toBe('dsng_songb00000')
  })

  it('resolves provider music id maps through exact mapped names', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const versioned = catalog.resolveReference({
      kind: 'provider-music-id',
      musicId: 99999,
      difficulty: DifficultyEnum.Master,
      map: { '99999': { name: 'Song A', ver: '24000' } },
    })

    expect(versioned?.identity).toEqual(SONG_A_DX_MASTER)
  })

  it('resolves provider music id maps by legacy song ID before ambiguous title fallback', () => {
    const catalog = buildSongCatalog(
      {
        ...fixtureData,
        songs: [
          { ...fixtureData.songs[0]!, title: 'Shared Name' },
          song({
            id: 'dsng_songb00000',
            title: 'Shared Name',
            sheets: [sheet({ id: 'dsht_songbdxmas', internalId: 10002 })],
          }),
        ],
      },
      VersionEnum.CiRCLE,
    )
    const reference = {
      kind: 'provider-music-id' as const,
      musicId: 999999,
      difficulty: DifficultyEnum.Master,
      map: { '999999': { name: 'Shared Name' } },
    }

    expect(catalog.resolveReference(reference)).toBeNull()
    expect(
      catalog.resolveReference({ ...reference, legacySongIds: { 'Shared Name': 'dsng_songa00000' } })?.songId,
    ).toBe('dsng_songa00000')
  })

  it('resolves legacy sheet identities through the legacy song ID map, then an unambiguous title', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const identity = { legacySongId: 'song-a', type: TypeEnum.DX, difficulty: DifficultyEnum.Master } as const

    expect(
      catalog.resolveReference({ kind: 'legacy', identity, legacySongIds: { 'song-a': 'dsng_songa00000' } })?.id,
    ).toBe('dsht_songadxmas')
    expect(catalog.resolveReference({ kind: 'legacy', identity, legacySongIds: {} })).toBeNull()
    expect(
      catalog.resolveReference({ kind: 'legacy', identity: { ...identity, legacySongId: 'Song A' }, legacySongIds: {} })
        ?.id,
    ).toBe('dsht_songadxmas')
  })

  it('caches one catalog per document and version, with frozen sheets', () => {
    const catalog = getSongCatalog(fixtureData, VersionEnum.CiRCLE)

    expect(getSongCatalog(fixtureData, VersionEnum.CiRCLE)).toBe(catalog)
    expect(getSongCatalog(fixtureData, VersionEnum.PRiSM)).not.toBe(catalog)
    expect(Object.isFrozen(catalog.sheets)).toBe(true)
    expect(Object.isFrozen(catalog.sheets[0])).toBe(true)
  })
})

describe('Song Catalog of the bundled snapshot', () => {
  const catalog = getSongCatalog(catalogSnapshot, VersionEnum.CiRCLE)

  it('has a unique public ID for every sheet', () => {
    expect(new Set(catalog.sheets.map((versioned) => versioned.id)).size).toBe(catalog.sheets.length)
    expect(catalog.sheets.every((versioned) => /^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$/.test(versioned.id))).toBe(
      true,
    )
  })

  it('resolves provider music ids by internal id before ambiguous title fallback (Link)', () => {
    const versioned = catalog.resolveReference({
      kind: 'provider-music-id',
      musicId: 383,
      difficulty: DifficultyEnum.Basic,
    })

    expect(versioned?.songId).toBe(LEGACY_SONG_IDS['Link (2)'])
    expect(versioned?.identity.type).toBe(TypeEnum.STD)
  })

  it('maps every legacy song ID to a song of the snapshot', () => {
    const songIds = new Set(catalogSnapshot.songs.map((entry) => entry.id))
    const missing = Object.entries(LEGACY_SONG_IDS).filter(([, songId]) => !songIds.has(songId))

    expect(missing).toEqual([])
  })

  it('resolves cached provider music id maps through title fallback when internal id misses', () => {
    const versioned = catalog.resolveReference({
      kind: 'provider-music-id',
      musicId: 99999,
      difficulty: DifficultyEnum.Master,
      map: { '99999': { name: '君の知らない物語', ver: '24000' } },
    })

    expect(versioned?.songId).toBe(LEGACY_SONG_IDS['君の知らない物語'])
  })
})