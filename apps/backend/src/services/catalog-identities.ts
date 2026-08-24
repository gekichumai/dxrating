const PRODUCTION_CHANNEL = 'production-v1'
const API_SCHEMA_VERSION = 1
const PUBLIC_ID_ALPHABET = '23456789abcdefghjkmnpqrstvwxyz'
const PUBLIC_SONG_ID_PATTERN = new RegExp(`^dsng_[${PUBLIC_ID_ALPHABET}]{10}$`)
const PUBLIC_SHEET_ID_PATTERN = new RegExp(`^dsht_[${PUBLIC_ID_ALPHABET}]{10}$`)

export type CatalogIdentityQuery = (text: string, values: unknown[]) => Promise<{ rows: unknown[] }>

export type CatalogIdentityErrorCode = 'bad_request' | 'not_found' | 'unavailable'

export class CatalogIdentityError extends Error {
  readonly code: CatalogIdentityErrorCode

  constructor(code: CatalogIdentityErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CatalogIdentityError'
    this.code = code
  }
}

type SongIdentity = {
  publicSongId: string
  legacySongId: string | undefined
  legacySongIds: Set<string>
}

type SheetIdentity = SongIdentity & {
  publicSheetId: string
  sheetType: string
  sheetDifficulty: string
}

type CatalogIdentitySnapshot = {
  catalogRunId: string
  publicationRevision: string
  publicationRevisionValue: bigint
  songsByPublicId: Map<string, SongIdentity>
  songsByLegacyId: Map<string, SongIdentity>
  sheetsByPublicId: Map<string, SheetIdentity>
  sheetsByLegacyTuple: Map<string, SheetIdentity>
}

type CatalogIdentityPointer = {
  catalogRunId: string
  publicationRevision: string
  publicationRevisionValue: bigint
}

export type ResolvedSongIdentity = {
  legacySongId: string
  legacySongIds: readonly string[]
  publicSongId?: string
}

export type ResolvedSheetIdentity = ResolvedSongIdentity & {
  publicSheetId?: string
  sheetType: string
  sheetDifficulty: string
}

export type PublicTagSongIdentity = {
  song_id: string
  sheet_id: string
  sheet_type: string
  sheet_difficulty: string
  tag_id: number
}

export interface CatalogIdentityService {
  resolveSongInput(songId: string): Promise<ResolvedSongIdentity>
  resolveSheetInput(input: {
    songId: string
    sheetId?: string
    sheetType: string
    sheetDifficulty: string
    /** Fail instead of preserving a legacy passthrough when a current public identity is required. */
    requirePublicIdentity?: boolean
  }): Promise<ResolvedSheetIdentity>
  translateSongIdsToPublic(songIds: readonly string[]): Promise<Map<string, string>>
  translateSongCountsToPublic(
    songCounts: readonly { songId: string; count: number }[],
  ): Promise<Array<{ songId: string; count: number }>>
  translateTagSongsToPublic(
    tagSongs: readonly {
      song_id: string
      sheet_type: string
      sheet_difficulty: string
      tag_id: number
    }[],
  ): Promise<PublicTagSongIdentity[]>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const legacySheetKey = (songId: string, sheetType: string, sheetDifficulty: string) =>
  JSON.stringify([songId, sheetType, sheetDifficulty])

const unavailable = (message: string, cause?: unknown) =>
  new CatalogIdentityError('unavailable', message, cause === undefined ? undefined : { cause })

const parsePointer = (row: unknown): CatalogIdentityPointer => {
  if (
    !isRecord(row) ||
    typeof row.catalog_run_id !== 'string' ||
    !/^[1-9]\d*$/.test(row.catalog_run_id) ||
    typeof row.publication_revision !== 'string' ||
    !/^[1-9]\d*$/.test(row.publication_revision)
  ) {
    throw unavailable('Published catalog identity pointer is invalid')
  }
  return {
    catalogRunId: row.catalog_run_id,
    publicationRevision: row.publication_revision,
    publicationRevisionValue: BigInt(row.publication_revision),
  }
}

const parseSnapshot = (pointer: CatalogIdentityPointer, rows: unknown[]): CatalogIdentitySnapshot | undefined => {
  if (rows.length === 0) return undefined

  const snapshot: CatalogIdentitySnapshot = {
    ...pointer,
    songsByPublicId: new Map(),
    songsByLegacyId: new Map(),
    sheetsByPublicId: new Map(),
    sheetsByLegacyTuple: new Map(),
  }

  for (const value of rows) {
    if (
      !isRecord(value) ||
      value.catalog_run_id !== pointer.catalogRunId ||
      value.publication_revision !== pointer.publicationRevision ||
      typeof value.public_song_id !== 'string' ||
      !PUBLIC_SONG_ID_PATTERN.test(value.public_song_id) ||
      (value.legacy_song_id !== null && typeof value.legacy_song_id !== 'string') ||
      !Array.isArray(value.legacy_song_ids) ||
      !value.legacy_song_ids.every((legacySongId) => typeof legacySongId === 'string' && legacySongId.length > 0)
    ) {
      throw unavailable('Published catalog song identities are invalid')
    }

    const legacySongId =
      value.legacy_song_id === null || value.legacy_song_id.length === 0 ? undefined : value.legacy_song_id
    let song = snapshot.songsByPublicId.get(value.public_song_id)
    if (song && song.legacySongId !== legacySongId) {
      throw unavailable('Published catalog contains conflicting song identities')
    }
    if (!song) {
      song = {
        publicSongId: value.public_song_id,
        legacySongId,
        legacySongIds: new Set(),
      }
      snapshot.songsByPublicId.set(song.publicSongId, song)
    }

    const aliases = legacySongId === undefined ? value.legacy_song_ids : [legacySongId, ...value.legacy_song_ids]
    for (const alias of aliases) {
      const previousLegacySong = snapshot.songsByLegacyId.get(alias)
      if (previousLegacySong && previousLegacySong.publicSongId !== song.publicSongId) {
        throw unavailable('Published catalog contains conflicting legacy song identities')
      }
      song.legacySongIds.add(alias)
      snapshot.songsByLegacyId.set(alias, song)
    }

    const hasSheet = value.public_sheet_id !== null
    const sheetFields = [value.public_sheet_id, value.sheet_type, value.sheet_difficulty]
    if (!hasSheet) {
      if (!sheetFields.every((field) => field === null)) {
        throw unavailable('Published catalog sheet identities are invalid')
      }
      continue
    }
    if (
      typeof value.public_sheet_id !== 'string' ||
      !PUBLIC_SHEET_ID_PATTERN.test(value.public_sheet_id) ||
      typeof value.sheet_type !== 'string' ||
      value.sheet_type.length === 0 ||
      typeof value.sheet_difficulty !== 'string' ||
      value.sheet_difficulty.length === 0
    ) {
      throw unavailable('Published catalog sheet identities are invalid')
    }

    const sheet: SheetIdentity = {
      ...song,
      publicSheetId: value.public_sheet_id,
      sheetType: value.sheet_type,
      sheetDifficulty: value.sheet_difficulty,
    }
    const previousSheet = snapshot.sheetsByPublicId.get(sheet.publicSheetId)
    if (
      previousSheet &&
      (previousSheet.publicSongId !== sheet.publicSongId ||
        previousSheet.sheetType !== sheet.sheetType ||
        previousSheet.sheetDifficulty !== sheet.sheetDifficulty)
    ) {
      throw unavailable('Published catalog contains conflicting sheet identities')
    }
    snapshot.sheetsByPublicId.set(sheet.publicSheetId, sheet)
  }

  for (const sheet of snapshot.sheetsByPublicId.values()) {
    for (const legacySongId of sheet.legacySongIds) {
      const key = legacySheetKey(legacySongId, sheet.sheetType, sheet.sheetDifficulty)
      const previousLegacySheet = snapshot.sheetsByLegacyTuple.get(key)
      if (previousLegacySheet && previousLegacySheet.publicSheetId !== sheet.publicSheetId) {
        throw unavailable('Published catalog contains conflicting legacy sheet identities')
      }
      snapshot.sheetsByLegacyTuple.set(key, sheet)
    }
  }

  return snapshot
}

const isPublicSongId = (value: string) => PUBLIC_SONG_ID_PATTERN.test(value)

const validateSongIdNamespace = (value: string) => {
  if (value.startsWith('dsng_') && !isPublicSongId(value)) {
    throw new CatalogIdentityError('bad_request', 'Malformed public song ID')
  }
  if (value.startsWith('dsht_')) {
    throw new CatalogIdentityError('bad_request', 'A sheet ID cannot be used as a song ID')
  }
}

const validatePublicSheetId = (value: string) => {
  if (!PUBLIC_SHEET_ID_PATTERN.test(value)) {
    throw new CatalogIdentityError('bad_request', 'Malformed public sheet ID')
  }
}

const requireLegacySongId = (song: SongIdentity): string => {
  if (song.legacySongId === undefined || song.legacySongId.length === 0) {
    throw unavailable(`Published song ${song.publicSongId} has no legacy compatibility identity`)
  }
  return song.legacySongId
}

export const createCatalogIdentityService = (query: CatalogIdentityQuery): CatalogIdentityService => {
  let cachedSnapshot: CatalogIdentitySnapshot | undefined
  const inFlightSnapshots = new Map<string, Promise<CatalogIdentitySnapshot | undefined>>()

  const queryCurrentPointer = async (): Promise<CatalogIdentityPointer> => {
    let result: { rows: unknown[] }
    try {
      result = await query(
        `
          SELECT
            publication.catalog_run_id::text AS catalog_run_id,
            publication.revision::text AS publication_revision
          FROM dxdata.catalog_publications AS publication
          INNER JOIN dxdata.catalog_snapshots AS snapshot
            ON snapshot.catalog_run_id = publication.catalog_run_id
          INNER JOIN dxdata.catalog_build_runs AS catalog_run
            ON catalog_run.id = publication.catalog_run_id
          WHERE publication.channel = $1
            AND catalog_run.status = 'published'
            AND catalog_run.api_schema_version = $2
            AND snapshot.api_schema_version = $2
          LIMIT 1
        `,
        [PRODUCTION_CHANNEL, API_SCHEMA_VERSION],
      )
    } catch (error) {
      throw unavailable('Published catalog identities are unavailable', error)
    }

    const row = result.rows[0]
    if (row === undefined) throw unavailable('Published catalog identities are unavailable')
    return parsePointer(row)
  }

  const loadSnapshot = async (pointer: CatalogIdentityPointer): Promise<CatalogIdentitySnapshot | undefined> => {
    let result: { rows: unknown[] }
    try {
      result = await query(
        `
          SELECT
            publication.catalog_run_id::text AS catalog_run_id,
            publication.revision::text AS publication_revision,
            catalog_song.song_id AS public_song_id,
            song.legacy_song_id,
            ARRAY(
              SELECT legacy_mapping.external_id
              FROM dxdata.song_source_mappings AS legacy_mapping
              WHERE legacy_mapping.song_id = catalog_song.song_id
                AND legacy_mapping.source_id = 'legacy_dxdata'
              ORDER BY legacy_mapping.external_id
            ) AS legacy_song_ids,
            catalog_sheet.sheet_id AS public_sheet_id,
            sheet.chart_type AS sheet_type,
            sheet.difficulty AS sheet_difficulty
          FROM dxdata.catalog_publications AS publication
          INNER JOIN dxdata.catalog_snapshots AS snapshot
            ON snapshot.catalog_run_id = publication.catalog_run_id
          INNER JOIN dxdata.catalog_build_runs AS catalog_run
            ON catalog_run.id = publication.catalog_run_id
          INNER JOIN dxdata.catalog_run_songs AS catalog_song
            ON catalog_song.catalog_run_id = publication.catalog_run_id
          INNER JOIN dxdata.canonical_songs AS song
            ON song.id = catalog_song.song_id
          LEFT JOIN dxdata.catalog_run_sheets AS catalog_sheet
            ON catalog_sheet.catalog_run_id = catalog_song.catalog_run_id
            AND catalog_sheet.song_id = catalog_song.song_id
          LEFT JOIN dxdata.canonical_sheets AS sheet
            ON sheet.id = catalog_sheet.sheet_id
            AND sheet.song_id = catalog_song.song_id
          WHERE publication.channel = $1
            AND publication.catalog_run_id = $2::bigint
            AND publication.revision = $3::bigint
            AND catalog_run.status = 'published'
            AND catalog_run.api_schema_version = $4
            AND snapshot.api_schema_version = $4
          ORDER BY catalog_song.ordinal, catalog_sheet.ordinal
        `,
        [PRODUCTION_CHANNEL, pointer.catalogRunId, pointer.publicationRevision, API_SCHEMA_VERSION],
      )
    } catch (error) {
      throw unavailable('Published catalog identities are unavailable', error)
    }
    return parseSnapshot(pointer, result.rows)
  }

  const loadSnapshotSingleFlight = (pointer: CatalogIdentityPointer) => {
    const key = JSON.stringify([pointer.catalogRunId, pointer.publicationRevision])
    const inFlight = inFlightSnapshots.get(key)
    if (inFlight) return inFlight

    const promise = loadSnapshot(pointer).finally(() => {
      inFlightSnapshots.delete(key)
    })
    inFlightSnapshots.set(key, promise)
    return promise
  }

  const installSnapshot = (snapshot: CatalogIdentitySnapshot): CatalogIdentitySnapshot => {
    if (!cachedSnapshot || snapshot.publicationRevisionValue > cachedSnapshot.publicationRevisionValue) {
      cachedSnapshot = snapshot
      return snapshot
    }
    if (
      snapshot.publicationRevisionValue === cachedSnapshot.publicationRevisionValue &&
      snapshot.catalogRunId !== cachedSnapshot.catalogRunId
    ) {
      throw unavailable('Published catalog identity revision is inconsistent')
    }
    return cachedSnapshot
  }

  const getCurrentSnapshot = async (): Promise<CatalogIdentitySnapshot> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const pointer = await queryCurrentPointer()
      if (cachedSnapshot) {
        if (pointer.publicationRevisionValue < cachedSnapshot.publicationRevisionValue) return cachedSnapshot
        if (pointer.publicationRevisionValue === cachedSnapshot.publicationRevisionValue) {
          if (pointer.catalogRunId !== cachedSnapshot.catalogRunId) {
            throw unavailable('Published catalog identity revision is inconsistent')
          }
          return cachedSnapshot
        }
      }

      const snapshot = await loadSnapshotSingleFlight(pointer)
      if (snapshot) return installSnapshot(snapshot)
      // The publication pointer can move between the pointer read and the
      // snapshot query. Re-read it once rather than serving the old catalog.
    }
    throw unavailable('Published catalog identities changed while being loaded')
  }

  const resolvePublicSong = async (songId: string) => {
    const snapshot = await getCurrentSnapshot()
    const song = snapshot.songsByPublicId.get(songId)
    if (!song) throw new CatalogIdentityError('not_found', 'Song is not in the current published catalog')
    return { snapshot, song }
  }

  const getBestEffortSnapshot = async (): Promise<CatalogIdentitySnapshot | undefined> => {
    try {
      return await getCurrentSnapshot()
    } catch (error) {
      if (error instanceof CatalogIdentityError && error.code === 'unavailable') return undefined
      throw error
    }
  }

  const legacySongPassthrough = (songId: string): ResolvedSongIdentity => ({
    legacySongId: songId,
    legacySongIds: [songId],
  })

  const legacySheetPassthrough = (input: {
    songId: string
    sheetType: string
    sheetDifficulty: string
  }): ResolvedSheetIdentity => ({
    ...legacySongPassthrough(input.songId),
    sheetType: input.sheetType,
    sheetDifficulty: input.sheetDifficulty,
  })

  return {
    async resolveSongInput(songId) {
      validateSongIdNamespace(songId)
      if (!isPublicSongId(songId)) {
        const snapshot = await getBestEffortSnapshot()
        const song = snapshot?.songsByLegacyId.get(songId)
        if (!song?.legacySongId) return legacySongPassthrough(songId)
        return {
          legacySongId: song.legacySongId,
          legacySongIds: [...song.legacySongIds],
          publicSongId: song.publicSongId,
        }
      }

      const { song } = await resolvePublicSong(songId)
      return {
        legacySongId: requireLegacySongId(song),
        legacySongIds: [...song.legacySongIds],
        publicSongId: song.publicSongId,
      }
    },

    async resolveSheetInput(input) {
      validateSongIdNamespace(input.songId)
      if (input.sheetId !== undefined) validatePublicSheetId(input.sheetId)

      const publicSongInput = isPublicSongId(input.songId)
      if (!publicSongInput && input.sheetId === undefined) {
        const fallback = legacySheetPassthrough(input)
        const snapshot = input.requirePublicIdentity ? await getCurrentSnapshot() : await getBestEffortSnapshot()
        const song = snapshot?.songsByLegacyId.get(input.songId)
        if (!song?.legacySongId) {
          if (input.requirePublicIdentity) {
            throw new CatalogIdentityError('not_found', 'Song is not in the current published catalog')
          }
          return fallback
        }
        const sheet = snapshot?.sheetsByLegacyTuple.get(
          legacySheetKey(input.songId, input.sheetType, input.sheetDifficulty),
        )
        if (!sheet || sheet.publicSongId !== song.publicSongId) {
          if (input.requirePublicIdentity) {
            throw new CatalogIdentityError('not_found', 'Chart is not in the current published catalog')
          }
          return fallback
        }
        return {
          legacySongId: song.legacySongId,
          legacySongIds: [...song.legacySongIds],
          publicSongId: song.publicSongId,
          publicSheetId: sheet.publicSheetId,
          sheetType: sheet.sheetType,
          sheetDifficulty: sheet.sheetDifficulty,
        }
      }

      const snapshot = await getCurrentSnapshot()
      const song = publicSongInput
        ? snapshot.songsByPublicId.get(input.songId)
        : snapshot.songsByLegacyId.get(input.songId)
      if (!song) {
        throw new CatalogIdentityError('not_found', 'Song is not in the current published catalog')
      }
      const legacySongId = requireLegacySongId(song)

      const sheet =
        input.sheetId === undefined
          ? snapshot.sheetsByLegacyTuple.get(legacySheetKey(legacySongId, input.sheetType, input.sheetDifficulty))
          : snapshot.sheetsByPublicId.get(input.sheetId)
      if (!sheet) {
        throw new CatalogIdentityError('not_found', 'Sheet is not in the current published catalog')
      }
      if (
        sheet.publicSongId !== song.publicSongId ||
        sheet.sheetType !== input.sheetType ||
        sheet.sheetDifficulty !== input.sheetDifficulty
      ) {
        throw new CatalogIdentityError('not_found', 'Chart is not in the current published catalog')
      }

      return {
        legacySongId,
        legacySongIds: [...song.legacySongIds],
        publicSongId: song.publicSongId,
        publicSheetId: sheet.publicSheetId,
        sheetType: sheet.sheetType,
        sheetDifficulty: sheet.sheetDifficulty,
      }
    },

    async translateSongIdsToPublic(songIds) {
      const snapshot = await getCurrentSnapshot()
      const translated = new Map<string, string>()
      for (const songId of songIds) {
        if ((songId.startsWith('dsng_') && !isPublicSongId(songId)) || songId.startsWith('dsht_')) continue
        const song = isPublicSongId(songId)
          ? snapshot.songsByPublicId.get(songId)
          : snapshot.songsByLegacyId.get(songId)
        if (song) translated.set(songId, song.publicSongId)
      }
      return translated
    },

    async translateSongCountsToPublic(songCounts) {
      const snapshot = await getCurrentSnapshot()
      const translated = new Map<string, number>()
      for (const { songId, count } of songCounts) {
        if ((songId.startsWith('dsng_') && !isPublicSongId(songId)) || songId.startsWith('dsht_')) continue
        const song = isPublicSongId(songId)
          ? snapshot.songsByPublicId.get(songId)
          : snapshot.songsByLegacyId.get(songId)
        if (!song) continue
        translated.set(song.publicSongId, (translated.get(song.publicSongId) ?? 0) + count)
      }
      return [...translated].map(([songId, count]) => ({ songId, count })).sort((a, b) => b.count - a.count)
    },

    async translateTagSongsToPublic(tagSongs) {
      const snapshot = await getCurrentSnapshot()
      const translated: PublicTagSongIdentity[] = []
      const seen = new Set<string>()
      for (const tagSong of tagSongs) {
        const sheet = snapshot.sheetsByLegacyTuple.get(
          legacySheetKey(tagSong.song_id, tagSong.sheet_type, tagSong.sheet_difficulty),
        )
        if (!sheet) continue
        const key = JSON.stringify([sheet.publicSongId, sheet.publicSheetId, tagSong.tag_id])
        if (seen.has(key)) continue
        seen.add(key)
        translated.push({
          song_id: sheet.publicSongId,
          sheet_id: sheet.publicSheetId,
          sheet_type: sheet.sheetType,
          sheet_difficulty: sheet.sheetDifficulty,
          tag_id: tagSong.tag_id,
        })
      }
      return translated
    },
  }
}