import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { getMigrationCatalog } from '../../../catalog/savedDataMigration'
import { LocalScoreRepository, mergeImportedEntries, readStoredEntries } from '../LocalScoreRepository'
import { UnsupportedScoreOperationError } from '../ScoreRepository'

const KEY = 'rating-calculator-entries'

// What browsers hold today under `rating-calculator-entries`, one entry of each kind the web has ever written
const STORED_ENTRIES = [
  // typed in the calculator
  { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 },
  // maimai NET import
  {
    sheetId: 'dsht_e5nsvt8k2a',
    identity: { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' },
    achievementRate: 100.5432,
    comboFlag: 'ap',
    syncFlag: 'fsd',
    source: { provider: 'maimai-net', providerSongName: '君の知らない物語' },
  },
  // Diving-Fish import, before DX scores were kept
  {
    sheetId: 'dsht_mpd82wyms9',
    achievementRate: 97.12345,
    comboFlag: null,
    syncFlag: null,
    source: { provider: 'diving-fish', providerId: 11451, providerSongName: 'Link', best50Bucket: 'b35' },
    providerConfig: { divingFish: { ratingEligibility: 'b35' } },
  },
  // saved before public sheet IDs, not migrated yet
  {
    sheetId: '君の知らない物語__dxrt__std__dxrt__expert',
    identity: { songId: '君の知らない物語', type: 'std', difficulty: 'expert' },
    achievementRate: 98,
  },
  // a sheet no catalog has, without identity
  { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 97 },
  // out of range: kept as saved, but not a valid record
  { sheetId: 'dsht_23456789ab', achievementRate: 101.5 },
] as PlayEntry[]

const STORED_JSON = JSON.stringify(STORED_ENTRIES)

const catalog = getMigrationCatalog(catalogSnapshot)
const resolveIdentity = (sheetId: string) => catalog.getById(sheetId)?.identity

/** A localStorage stand-in that records every write */
function createStorage(initial: string | null = STORED_JSON) {
  const values = new Map<string, string>()
  if (initial !== null) values.set(KEY, initial)
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    clear: vi.fn(() => values.clear()),
    key: vi.fn(() => null),
    get length() {
      return values.size
    },
  } satisfies Storage
  return { storage, stored: () => values.get(KEY) ?? null }
}

describe('LocalScoreRepository', () => {
  let storage: ReturnType<typeof createStorage>
  let repository: LocalScoreRepository

  beforeEach(() => {
    storage = createStorage()
    repository = new LocalScoreRepository(storage.storage)
  })

  describe('reading the saved format', () => {
    it('loads the entries existing users have saved, unchanged, without writing', () => {
      expect(repository.kind).toBe('local')
      expect(repository.entries()).toEqual(STORED_ENTRIES)
      expect(JSON.stringify(repository.entries())).toBe(STORED_JSON)
      expect(storage.storage.setItem).not.toHaveBeenCalled()
    })

    it.each([
      ['a missing key', null],
      ['invalid JSON', 'invalid json'],
      ['a value that is not a list', '{"sheetId":"dsht_5mk3yr8gme"}'],
      ['null', 'null'],
    ])('reads %s as no entries', (_, value) => {
      expect(readStoredEntries(createStorage(value).storage)).toEqual([])
    })

    it('reads a storage that throws as no entries', () => {
      const throwing = {
        ...createStorage().storage,
        getItem: () => {
          throw new Error('SecurityError')
        },
      }
      expect(readStoredEntries(throwing)).toEqual([])
    })

    it('starts empty and in memory without a storage (SSR)', () => {
      const detached = new LocalScoreRepository(null)
      expect(detached.entries()).toEqual([])
      detached.setManual({ sheetId: 'dsht_5mk3yr8gme', achievementRate: 100 }, 'typed')
      expect(detached.entries()).toEqual([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 100 }])
    })
  })

  describe('records', () => {
    it('derives records with catalog identities and integer achievements', () => {
      repository.setIdentityResolver(resolveIdentity)
      expect(repository.list()).toMatchSnapshot()
    })

    it('lists only entries with an identity until the catalog resolves the rest', () => {
      expect(repository.list().map((record) => record.sheetId)).toEqual([
        'dsht_e5nsvt8k2a',
        '君の知らない物語__dxrt__std__dxrt__expert',
      ])

      repository.setIdentityResolver(resolveIdentity)
      expect(repository.list().map((record) => record.sheetId)).toEqual([
        'dsht_5mk3yr8gme',
        'dsht_e5nsvt8k2a',
        'dsht_mpd82wyms9',
        '君の知らない物語__dxrt__std__dxrt__expert',
      ])
    })

    it('fills in identity from the catalog only when the entry has none', () => {
      repository.setIdentityResolver(resolveIdentity)
      expect(repository.get('dsht_5mk3yr8gme')?.identity).toEqual(catalog.getById('dsht_5mk3yr8gme')!.identity)
      expect(repository.get('君の知らない物語__dxrt__std__dxrt__expert')?.identity).toEqual({
        songId: '君の知らない物語',
        type: 'std',
        difficulty: 'expert',
      })
    })

    it('rounds achievements half-even on the decimal and keeps the display rate', () => {
      repository.setIdentityResolver(resolveIdentity)
      expect(repository.get('dsht_e5nsvt8k2a')).toMatchObject({ achievement: 1005432, achievementRate: 100.5432 })
      expect(repository.get('dsht_mpd82wyms9')).toMatchObject({ achievement: 971234, best50Bucket: 'b35' })
      expect(repository.get('dsht_23456789ab')).toBeUndefined()
    })

    it('keeps the same list between changes and a new one after each change', () => {
      const listener = vi.fn()
      repository.subscribe(listener)
      const first = repository.list()
      expect(repository.list()).toBe(first)

      repository.setIdentityResolver(resolveIdentity)
      expect(listener).toHaveBeenCalledTimes(1)
      const resolved = repository.list()
      expect(resolved).not.toBe(first)

      repository.delete(['dsht_5mk3yr8gme'])
      expect(listener).toHaveBeenCalledTimes(2)
      expect(repository.list()).not.toBe(resolved)
    })

    it('stops notifying after unsubscribing', () => {
      const listener = vi.fn()
      const unsubscribe = repository.subscribe(listener)
      unsubscribe()
      repository.clear()
      expect(listener).not.toHaveBeenCalled()
    })

    it('has no provenance and an idle status in the local save', () => {
      repository.setIdentityResolver(resolveIdentity)
      expect(repository.list().every((record) => record.provenance === null)).toBe(true)
      expect(repository.status).toEqual({ state: 'idle', pendingCount: 0, lastSyncedRevision: 0, issues: [] })
    })
  })

  describe('writes, as the calculator always wrote them', () => {
    it('replaces the saved entry of a chart typed again, as a whole', () => {
      repository.setManual({ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.1 }, 'typed')
      const expected = STORED_ENTRIES.map((entry) =>
        entry.sheetId === 'dsht_e5nsvt8k2a' ? { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.1 } : entry,
      )
      expect(repository.entries()).toEqual(expected)
      expect(storage.stored()).toBe(JSON.stringify(expected))
    })

    it('appends a chart typed for the first time', () => {
      repository.setManual({ sheetId: 'dsht_kfxhqhkxwr', achievementRate: 95 }, 'keypad')
      const expected = [...STORED_ENTRIES, { sheetId: 'dsht_kfxhqhkxwr', achievementRate: 95 }]
      expect(storage.stored()).toBe(JSON.stringify(expected))
    })

    it('deletes every entry of the given charts', () => {
      repository.delete(['dsht_5mk3yr8gme', 'retired song__dxrt__dx__dxrt__master'])
      expect(storage.stored()).toBe(
        JSON.stringify(
          STORED_ENTRIES.filter(
            (entry) => !['dsht_5mk3yr8gme', 'retired song__dxrt__dx__dxrt__master'].includes(entry.sheetId),
          ),
        ),
      )
    })

    it('clears the save to an empty list', () => {
      repository.clear()
      expect(repository.entries()).toEqual([])
      expect(storage.stored()).toBe('[]')
    })

    it('replaces the save with an import, keeping the DX score', async () => {
      const imported: PlayEntry[] = [
        {
          sheetId: 'dsht_mpd82wyms9',
          identity: catalog.getById('dsht_mpd82wyms9')!.identity,
          achievementRate: 100.2,
          comboFlag: 'fcp',
          syncFlag: null,
          dxScore: 1234,
          source: { provider: 'diving-fish', providerId: 11451, providerSongName: 'Link', best50Bucket: 'b15' },
          providerConfig: { divingFish: { ratingEligibility: 'b15' } },
        },
      ]
      const pending = repository.applyImport(imported, { source: 'diving-fish', mode: 'replace' })
      // written before the promise settles
      expect(storage.stored()).toBe(JSON.stringify(imported))
      await expect(pending).resolves.toEqual({ count: 1 })

      repository.setIdentityResolver(resolveIdentity)
      expect(repository.get('dsht_mpd82wyms9')).toMatchObject({ dxScore: 1234, best50Bucket: 'b15' })
    })

    it('merges a maimai NET import: new charts added, only higher achievements replace values', async () => {
      await repository.applyImport(
        [
          { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.0, comboFlag: 'fc' },
          { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.6, comboFlag: 'fcp', syncFlag: null, dxScore: 2000 },
          { sheetId: 'dsht_kfxhqhkxwr', achievementRate: 94, comboFlag: null, syncFlag: 'fs' },
        ],
        { source: 'maimai-net', mode: 'merge' },
      )
      expect(JSON.parse(storage.stored()!)).toMatchSnapshot()
    })

    it('writes nothing more than the change when the storage refuses it, keeping it for the visit', () => {
      storage.storage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      repository.clear()
      expect(repository.entries()).toEqual([])
    })

    it('replaces the save wholesale for migrations', () => {
      const migrated = [{ sheetId: 'dsht_dummy', achievementRate: 98 }]
      repository.applyMigration(migrated)
      expect(storage.stored()).toBe(JSON.stringify(migrated))
    })

    it('cannot run server imports', () => {
      expect(() => repository.runServerImport('lxns', {})).toThrow(UnsupportedScoreOperationError)
    })
  })

  describe('mergeImportedEntries', () => {
    const existing: PlayEntry = {
      sheetId: 'dsht_e5nsvt8k2a',
      achievementRate: 100,
      comboFlag: 'fc',
      syncFlag: 'fs',
      dxScore: 1500,
      source: { provider: 'lxns', providerId: 1 },
    }

    it('keeps everything but the score values of the saved entry', () => {
      expect(
        mergeImportedEntries(
          [existing],
          [{ sheetId: existing.sheetId, achievementRate: 100.5, comboFlag: 'ap', source: { provider: 'maimai-net' } }],
        ),
      ).toEqual([{ sheetId: existing.sheetId, achievementRate: 100.5, comboFlag: 'ap', source: existing.source }])
    })

    it('leaves a saved entry with an equal or higher achievement alone', () => {
      const current = [existing]
      expect(mergeImportedEntries(current, [{ ...existing, achievementRate: 100, comboFlag: 'app' }])).toEqual(current)
    })

    it('does not modify the saved list', () => {
      const current = [existing]
      mergeImportedEntries(current, [{ ...existing, achievementRate: 101 }])
      expect(current).toEqual([existing])
    })
  })
})