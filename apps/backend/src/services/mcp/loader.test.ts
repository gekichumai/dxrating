import { Effect, Exit } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from '@effect/vitest'
import type { PublishedDxdataMetadata } from '../dxdata'
import { createMcpCatalogLoader } from './loader'
import { HIBANA, publishedCatalog } from './test-fixture'

const metadata = (catalogRunId: string, bodySha256 = catalogRunId.padStart(64, '0')): PublishedDxdataMetadata => ({
  catalogRunId,
  bodySha256,
  byteLength: '1',
  contentType: 'application/json',
})

function fakeStore(initial: { metadata?: PublishedDxdataMetadata; body?: string }) {
  const state = { ...initial, fail: false, metadataReads: 0, bodyReads: 0 }
  return {
    state,
    store: {
      getPublishedMetadata: () =>
        Effect.suspend(() => {
          state.metadataReads += 1
          return state.fail ? Effect.fail('database is down') : Effect.succeed(state.metadata)
        }),
      getSnapshotBody: () =>
        Effect.sync(() => {
          state.bodyReads += 1
          return state.body
        }),
    },
  }
}

const body = (songs = publishedCatalog.songs) => JSON.stringify({ ...publishedCatalog, songs })

describe('MCP catalog loader', () => {
  it.effect('loads the published catalog once and serves it from memory within the check interval', () =>
    Effect.gen(function* () {
      const { state, store } = fakeStore({ metadata: metadata('1'), body: body() })
      const loader = createMcpCatalogLoader(store, { checkIntervalMs: 60_000 })
      const [first, second] = yield* Effect.all([loader.current, loader.current], { concurrency: 'unbounded' })
      expect(first.catalogRunId).toBe('1')
      expect(second).toBe(first)
      expect(first.songsById.has(HIBANA)).toBe(true)
      expect(state).toMatchObject({ metadataReads: 1, bodyReads: 1 })

      yield* TestClock.adjust('30 seconds')
      yield* loader.current
      expect(state.metadataReads).toBe(1)
    }),
  )

  it.effect('checks the pointer after the interval and reloads only when it moved', () =>
    Effect.gen(function* () {
      const { state, store } = fakeStore({ metadata: metadata('1'), body: body() })
      const loader = createMcpCatalogLoader(store, { checkIntervalMs: 60_000 })
      const first = yield* loader.current

      yield* TestClock.adjust('61 seconds')
      expect(yield* loader.current).toBe(first)
      expect(state).toMatchObject({ metadataReads: 2, bodyReads: 1 })

      state.metadata = metadata('2')
      state.body = body(publishedCatalog.songs.filter((song) => song.id !== HIBANA))
      yield* TestClock.adjust('61 seconds')
      const second = yield* loader.current
      expect(second.catalogRunId).toBe('2')
      expect(second.songsById.has(HIBANA)).toBe(false)
      expect(state.bodyReads).toBe(2)
    }),
  )

  it.effect('keeps serving the last catalog when a check fails, and reports the error', () =>
    Effect.gen(function* () {
      const errors: unknown[] = []
      const { state, store } = fakeStore({ metadata: metadata('1'), body: body() })
      const loader = createMcpCatalogLoader(store, { reportError: (error) => errors.push(error) })
      const first = yield* loader.current

      state.fail = true
      yield* TestClock.adjust('61 seconds')
      expect(yield* loader.current).toBe(first)
      expect(errors).toEqual(['database is down'])
      // the failed check counts as a check: the next one waits for the interval
      yield* loader.current
      expect(state.metadataReads).toBe(2)
    }),
  )

  it.effect('fails before a catalog is loaded, and checks again only after the interval', () =>
    Effect.gen(function* () {
      const errors: unknown[] = []
      const { state, store } = fakeStore({})
      const loader = createMcpCatalogLoader(store, { reportError: (error) => errors.push(error) })
      const exits = yield* Effect.all(
        Array.from({ length: 20 }, () => Effect.exit(loader.current)),
        { concurrency: 'unbounded' },
      )
      expect(exits.every(Exit.isFailure)).toBe(true)
      expect(state.metadataReads).toBe(1)

      // published, but not checked again before the interval
      state.metadata = metadata('1')
      state.body = body()
      expect(Exit.isFailure(yield* Effect.exit(loader.current))).toBe(true)
      expect(state.metadataReads).toBe(1)

      yield* TestClock.adjust('61 seconds')
      expect((yield* loader.current).catalogRunId).toBe('1')
      expect(errors).toEqual([])
    }),
  )

  it.effect('reports a failed first check once per interval, and recovers', () =>
    Effect.gen(function* () {
      const errors: unknown[] = []
      const { state, store } = fakeStore({ metadata: metadata('1'), body: body() })
      state.fail = true
      const loader = createMcpCatalogLoader(store, { reportError: (error) => errors.push(error) })
      yield* Effect.all(
        Array.from({ length: 20 }, () => Effect.exit(loader.current)),
        { concurrency: 'unbounded' },
      )
      expect(state.metadataReads).toBe(1)
      expect(errors).toEqual(['database is down'])

      state.fail = false
      yield* TestClock.adjust('61 seconds')
      expect((yield* loader.current).catalogRunId).toBe('1')
      expect(state.metadataReads).toBe(2)
    }),
  )

  it.effect('does not parse an invalid body again until the pointer moves', () =>
    Effect.gen(function* () {
      const errors: unknown[] = []
      const { state, store } = fakeStore({ metadata: metadata('1'), body: body() })
      const loader = createMcpCatalogLoader(store, { reportError: (error) => errors.push(error) })
      const first = yield* loader.current

      state.metadata = metadata('2')
      state.body = '{"schemaVersion":2}'
      yield* TestClock.adjust('61 seconds')
      expect(yield* loader.current).toBe(first)
      expect(errors).toHaveLength(1)

      yield* TestClock.adjust('61 seconds')
      expect(yield* loader.current).toBe(first)
      expect(state.bodyReads).toBe(2)
      expect(errors).toHaveLength(1)
    }),
  )
})