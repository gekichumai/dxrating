import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataOverview, formatAge } from './DataOverview'

const overview = {
  channel: 'production-v1',
  observedAt: '2026-11-07T12:00:00.000Z',
  current: {
    revision: 8,
    publishedAt: '2026-11-06T09:00:00.000Z',
    ageSeconds: 97_200,
    pipelineVersion: 'assembly-line@f8f5640',
    songCount: 1803,
    sheetCount: 7405,
    hasProvenanceManifest: true,
    publicationCount: 8,
  },
  latestChange: {
    from: 7,
    to: 8,
    summary: {
      songsAdded: 2,
      songsRemoved: 0,
      songsChanged: 9,
      sheetsAdded: 8,
      sheetsRemoved: 0,
      sheetsChanged: 8,
      fieldChanges: 9,
    },
    pathCounts: [{ path: 'sheets[].internalLevelValue', count: 6 }],
  },
  sources: [
    {
      id: 'sega_official_jp',
      name: 'SEGA JP',
      kind: 'catalog',
      authoritative: true,
      scope: 'catalog',
      lastObservedAt: '2026-11-07T06:00:00.000Z',
      ageSeconds: 21_600,
      itemCount: 1803,
      observations: 40,
    },
    {
      id: 'otoge_db',
      name: 'Otoge DB',
      kind: 'enrichment',
      authoritative: false,
      scope: 'catalog',
      lastObservedAt: '2026-10-20T00:00:00.000Z',
      ageSeconds: 18 * 86_400,
      itemCount: 1700,
      observations: 12,
    },
    {
      id: 'never_seen',
      name: 'Never',
      kind: 'alias',
      authoritative: false,
      scope: null,
      lastObservedAt: null,
      ageSeconds: null,
      itemCount: null,
      observations: 0,
    },
  ],
  failures: { recorded: false, note: 'The assembly line does not record failed source attempts yet (meta#50 door D3)' },
}

const mount = () =>
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DataOverview />
      </QueryClientProvider>
    </MantineProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DataOverview', () => {
  it('shows the current publication, the latest change and each source’s freshness', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(overview)),
    )
    mount()
    expect((await screen.findByText('r8')).getAttribute('href')).toBe('#publications')
    expect(screen.getByText('1 d 3 h ago')).toBeTruthy()
    expect(
      screen
        .getByText(/r7 → r8: 9 songs changed/)
        .closest('a')
        ?.getAttribute('href'),
    ).toBe('#diff?from=7&to=8')
    expect(screen.getByText('sheets[].internalLevelValue · 6').closest('a')?.getAttribute('href')).toBe(
      `#diff?from=7&to=8&path=${encodeURIComponent('sheets[].internalLevelValue')}`,
    )
    const rows = screen.getByRole('table', { name: 'Sources' }).querySelectorAll('tbody tr')
    expect(rows[0]!.textContent).toContain('authoritative')
    expect(rows[0]!.textContent).toContain('6 h ago')
    expect(rows[1]!.textContent).toContain('over a week')
    expect(rows[2]!.textContent).toContain('never observed')
    expect(screen.getByText(/does not record failed source attempts/)).toBeTruthy()
  })

  it('says when nothing is published yet, and still lists the sources', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ...overview, current: null, latestChange: null })),
    )
    mount()
    expect((await screen.findByText(/Nothing is published/)).textContent).toContain('production-v1')
    // Source freshness still shows, so a source that never fed the catalog is visible before the first publication
    expect(screen.getByRole('table', { name: 'Sources' }).textContent).toContain('sega_official_jp')
  })

  it('formats ages', () => {
    expect([formatAge(30), formatAge(3600 * 5), formatAge(86_400 * 2), formatAge(97_200)]).toEqual([
      '1 min ago',
      '5 h ago',
      '2 d ago',
      '1 d 3 h ago',
    ])
  })
})