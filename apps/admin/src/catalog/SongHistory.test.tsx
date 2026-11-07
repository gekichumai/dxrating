import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SongHistory } from './SongHistory'

const entry = (revision: number, present: boolean, change: unknown) => ({
  revision,
  publishedAt: `2026-11-0${revision}T00:00:00.000Z`,
  bodySha256: String(revision).padStart(64, 'c'),
  present,
  change,
})
const sheet = { id: 'dsht_synthetic1', type: 'dx', difficulty: 'master' }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SongHistory', () => {
  it('shows each publication’s changes to the song, with a link to the whole-catalog diff', async () => {
    const requests: URL[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        requests.push(new URL(input instanceof Request ? input.url : input, 'http://admin.test'))
        return Response.json({
          channel: 'production-v1',
          songId: 'dsng_synthetic1',
          title: 'Synthetic One',
          entries: [
            entry(4, true, {
              songId: 'dsng_synthetic1',
              title: 'Synthetic One',
              kind: 'changed',
              fields: [],
              sheets: [
                { ...sheet, kind: 'changed', fields: [{ path: 'internalLevelValue', before: 13.5, after: 13.7 }] },
              ],
            }),
            entry(3, true, null),
            entry(2, true, {
              songId: 'dsng_synthetic1',
              title: 'Synthetic One',
              kind: 'added',
              fields: [],
              sheets: [{ ...sheet, kind: 'added', fields: [] }],
            }),
            entry(1, false, null),
          ],
        })
      }),
    )
    render(
      <MantineProvider>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <SongHistory songId="dsng_synthetic1" />
        </QueryClientProvider>
      </MantineProvider>,
    )
    const level = (await screen.findByText('internalLevelValue')).closest('tr')!
    expect(level.textContent).toContain('r4')
    expect(level.textContent).toContain('dx master')
    expect(level.textContent).toContain('13.5')
    expect(level.textContent).toContain('13.7')
    expect(screen.getByText('Whole catalog r3 → r4').getAttribute('href')).toBe('#diff?from=3&to=4')
    expect(screen.getByText('No change').closest('tr')!.textContent).toContain('r3')
    expect(screen.getByText('song added').closest('tr')!.textContent).toContain('r2')
    expect(screen.getByText('Not in this publication').closest('tr')!.textContent).toContain('r1')
    expect(screen.getByText(/not a curated game-version history/)).toBeTruthy()
    expect(requests[0]!.pathname).toBe('/api/catalog/song/history')
    expect(requests[0]!.searchParams.get('songId')).toBe('dsng_synthetic1')
  })
})