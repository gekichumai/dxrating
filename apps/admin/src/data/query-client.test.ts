import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_MUTATION_DEFAULTS,
  ADMIN_QUERY_DEFAULTS,
  createAdminQueryClient,
  createAdminTestQueryClient,
} from './query-client'

afterEach(() => {
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

describe('administrator Query Client policy', () => {
  it('enables event-driven stale refresh without a global freshness window or polling timer', () => {
    const defaults = createAdminQueryClient().getDefaultOptions()

    expect(defaults.queries).toMatchObject({
      refetchInterval: false,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retry: ADMIN_QUERY_DEFAULTS.retry,
      retryDelay: ADMIN_QUERY_DEFAULTS.retryDelay,
    })
    expect(defaults.queries).not.toHaveProperty('staleTime')
    expect(defaults.mutations).toEqual(ADMIN_MUTATION_DEFAULTS)
  })

  it('refetches an active stale query on focus but respects a fresh query window', async () => {
    const client = createAdminQueryClient()
    client.mount()
    const staleFetch = vi.fn().mockResolvedValue('stale value')
    const freshFetch = vi.fn().mockResolvedValue('fresh value')
    const staleObserver = new QueryObserver(client, {
      queryFn: staleFetch,
      queryKey: ['admin', 'stale-focus'],
      staleTime: 0,
    })
    const freshObserver = new QueryObserver(client, {
      queryFn: freshFetch,
      queryKey: ['admin', 'fresh-focus'],
      staleTime: Number.POSITIVE_INFINITY,
    })
    const unsubscribeStale = staleObserver.subscribe(() => undefined)
    const unsubscribeFresh = freshObserver.subscribe(() => undefined)

    try {
      await vi.waitFor(() => {
        expect(staleFetch).toHaveBeenCalledTimes(1)
        expect(freshFetch).toHaveBeenCalledTimes(1)
      })

      focusManager.setFocused(false)
      focusManager.setFocused(true)

      await vi.waitFor(() => expect(staleFetch).toHaveBeenCalledTimes(2))
      expect(freshFetch).toHaveBeenCalledTimes(1)
    } finally {
      unsubscribeStale()
      unsubscribeFresh()
      client.unmount()
      client.clear()
    }
  })

  it('refetches an active stale query after reconnect', async () => {
    const client = createAdminQueryClient()
    client.mount()
    const queryFn = vi.fn().mockResolvedValue('value')
    const observer = new QueryObserver(client, {
      queryFn,
      queryKey: ['admin', 'stale-reconnect'],
      staleTime: 0,
    })
    const unsubscribe = observer.subscribe(() => undefined)

    try {
      await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
    } finally {
      unsubscribe()
      client.unmount()
      client.clear()
    }
  })

  it('creates isolated deterministic test caches with retries disabled', () => {
    const first = createAdminTestQueryClient()
    const second = createAdminTestQueryClient()
    first.setQueryData(['admin', 'users'], { private: true })

    expect(first).not.toBe(second)
    expect(second.getQueryData(['admin', 'users'])).toBeUndefined()
    expect(first.getDefaultOptions().queries).toMatchObject({
      gcTime: Number.POSITIVE_INFINITY,
      refetchInterval: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
    })
    expect(first.getDefaultOptions().mutations).toMatchObject({
      gcTime: Number.POSITIVE_INFINITY,
      retry: false,
    })
  })
})