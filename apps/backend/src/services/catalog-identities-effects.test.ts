import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { createCatalogIdentityEffects } from './catalog-identities'

const runTest = <A, E>(effect: Effect.Effect<A, E>, options?: { signal?: AbortSignal }) =>
  Effect.runPromise(effect, options)

const songId = 'dsng_23456789ab'
const snapshot = {
  rows: [
    {
      catalog_run_id: '1',
      publication_revision: '1',
      public_song_id: songId,
      legacy_song_id: 'legacy-song',
      legacy_song_ids: ['legacy-song'],
      public_sheet_id: null,
      sheet_type: null,
      sheet_difficulty: null,
    },
  ],
}
const pointer = { rows: [{ catalog_run_id: '1', publication_revision: '1' }] }
const expected = { publicSongId: songId, legacySongId: 'legacy-song', legacySongIds: ['legacy-song'] }

describe('catalog snapshot interruption isolation', () => {
  it('lets another live waiter load the snapshot when the initial producer is interrupted', async () => {
    let pointerReads = 0
    let snapshotReads = 0
    let cancelled = 0
    const identities = createCatalogIdentityEffects((text) =>
      Effect.suspend(() => {
        if (!text.includes('catalog_song.song_id AS public_song_id')) {
          pointerReads += 1
          return Effect.succeed(pointer)
        }
        snapshotReads += 1
        if (snapshotReads > 1) return Effect.succeed(snapshot)
        return Effect.callback<{ rows: unknown[] }>(() =>
          Effect.sync(() => {
            cancelled += 1
          }),
        )
      }),
    )
    const controller = new AbortController()
    const first = expect(
      runTest(identities.resolveSongInput(songId), { signal: controller.signal }),
    ).rejects.toBeDefined()
    await vi.waitFor(() => expect(snapshotReads).toBe(1))
    const second = runTest(identities.resolveSongInput(songId))
    await vi.waitFor(() => expect(pointerReads).toBe(2))
    controller.abort()
    await first
    await expect(second).resolves.toEqual(expected)
    expect(cancelled).toBe(1)
    expect(snapshotReads).toBe(2)
    await expect(runTest(identities.resolveSongInput(songId))).resolves.toEqual(expected)
    expect(snapshotReads).toBe(2)
  })

  it('does not restart a cancelled producer when it has no live waiters', async () => {
    let snapshotReads = 0
    const identities = createCatalogIdentityEffects((text) =>
      Effect.suspend(() => {
        if (!text.includes('catalog_song.song_id AS public_song_id')) return Effect.succeed(pointer)
        snapshotReads += 1
        return snapshotReads === 1 ? Effect.never : Effect.succeed(snapshot)
      }),
    )
    const controller = new AbortController()
    const first = expect(
      runTest(identities.resolveSongInput(songId), { signal: controller.signal }),
    ).rejects.toBeDefined()
    await vi.waitFor(() => expect(snapshotReads).toBe(1))
    controller.abort()
    await first
    expect(snapshotReads).toBe(1)
    await expect(runTest(identities.resolveSongInput(songId))).resolves.toEqual(expected)
    expect(snapshotReads).toBe(2)
  })

  it('keeps an active producer shared when a waiting request is interrupted', async () => {
    let pointerReads = 0
    let snapshotReads = 0
    let complete!: () => void
    const identities = createCatalogIdentityEffects((text) =>
      Effect.suspend(() => {
        if (!text.includes('catalog_song.song_id AS public_song_id')) {
          pointerReads += 1
          return Effect.succeed(pointer)
        }
        snapshotReads += 1
        return Effect.callback<{ rows: unknown[] }>((resume) => {
          complete = () => resume(Effect.succeed(snapshot))
        })
      }),
    )
    const first = runTest(identities.resolveSongInput(songId))
    await vi.waitFor(() => expect(snapshotReads).toBe(1))
    const controller = new AbortController()
    const second = expect(
      runTest(identities.resolveSongInput(songId), { signal: controller.signal }),
    ).rejects.toBeDefined()
    await vi.waitFor(() => expect(pointerReads).toBe(2))
    controller.abort()
    await second
    const third = runTest(identities.resolveSongInput(songId))
    await vi.waitFor(() => expect(pointerReads).toBe(3))
    expect(snapshotReads).toBe(1)
    complete()
    await expect(first).resolves.toEqual(expected)
    await expect(third).resolves.toEqual(expected)
    expect(snapshotReads).toBe(1)
  })
})