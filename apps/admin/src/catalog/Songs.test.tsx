import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SongProvenance, SongSearch } from './Songs'

const publication = {
  revision: 8,
  fingerprint: '8'.repeat(64),
  publishedAt: '2026-10-28T02:30:00.000Z',
  bodySha256: 'c'.repeat(64),
}
const rule = (outputPath: string, sources: { source: string; resolved: string[] | null }[], transforms: string[]) => ({
  outputPath,
  sources,
  transforms,
})
const song = {
  channel: 'production-v1',
  publication,
  song: { songId: 'dsng_demo000001', legacySongId: 'Demo Song 1', title: 'Demo Song 1', artist: 'Demo Artist' },
  manifest: {
    schemaVersion: 1,
    generatedAt: publication.publishedAt,
    coverage: { percent: 100, leafFields: 1200 },
    sources: { sega_official_jp: { path: 'official/jp.json', sha256: 'e'.repeat(64), recordCount: 1803 } },
    runtime: null,
  },
  lineage: { catalog: 'sega_official_jp', enrichment: null, regions: ['sega_official_jp', 'maimai_cn'] },
  fields: [
    {
      path: 'title',
      outputPath: 'songs[].title',
      value: 'Demo Song 1',
      rule: rule(
        'songs[].title',
        [
          { source: 'assembly.songs.*.catalog', resolved: ['sega_official_jp'] },
          { source: 'viscum_json', resolved: null },
        ],
        ['normalize_song_identity'],
      ),
      note: null,
    },
  ],
  sheets: [
    {
      id: 'dsht_demo000001',
      type: 'dx',
      difficulty: 'master',
      fields: [
        {
          path: 'id',
          outputPath: 'songs[].sheets[].id',
          value: 'dsht_demo000001',
          rule: null,
          note: 'Public sheet ID',
        },
        {
          path: 'internalLevelValue',
          outputPath: 'songs[].sheets[].internalLevelValue',
          value: 13.7,
          rule: null,
          note: null,
        },
      ],
    },
  ],
}

const requests: URL[] = []
const stub = (respond: (url: URL) => Response) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string) => {
      const url = new URL(input instanceof Request ? input.url : input, 'http://admin.test')
      requests.push(url)
      if (url.pathname === '/api/catalog/publications')
        return Response.json({ channel: 'production-v1', channels: [], publications: [], nextBefore: null })
      return respond(url)
    }),
  )
const mount = (node: ReactNode) =>
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {node}
      </QueryClientProvider>
    </MantineProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  requests.length = 0
  window.location.hash = ''
})

describe('SongSearch', () => {
  it('lists matches linking to each song, and searches through the URL', async () => {
    stub(() =>
      Response.json({
        channel: 'production-v1',
        publication,
        total: 3,
        songs: [{ songId: 'demo-song-1', title: 'Demo Song 1', artist: 'Demo Artist', sheetCount: 4 }],
      }),
    )
    mount(<SongSearch q="demo" />)
    expect((await screen.findByText('Demo Song 1')).getAttribute('href')).toBe('#song?songId=demo-song-1')
    expect(screen.getByText(/3 songs in r8/).textContent).toContain('first 1')
    expect(requests.find((u) => u.pathname === '/api/catalog/songs')!.searchParams.get('q')).toBe('demo')
    fireEvent.change(screen.getByLabelText(/Search by ID/), { target: { value: ' tune ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(window.location.hash).toBe('#songs?q=tune')
  })
})

describe('SongSearch navigation', () => {
  it('follows the URL query on Back/Forward', async () => {
    stub(() => Response.json({ channel: 'production-v1', publication, total: 0, songs: [] }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = (q: string) => (
      <MantineProvider>
        <QueryClientProvider client={client}>
          <SongSearch q={q} />
        </QueryClientProvider>
      </MantineProvider>
    )
    const { rerender } = render(view('one'))
    expect((screen.getByLabelText(/Search by ID/) as HTMLInputElement).value).toBe('one')
    rerender(view('two'))
    expect((screen.getByLabelText(/Search by ID/) as HTMLInputElement).value).toBe('two')
  })
})

describe('SongProvenance', () => {
  it('carries a non-default channel into its queries and links, and keeps the picker on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        const url = new URL(input instanceof Request ? input.url : input, 'http://admin.test')
        requests.push(url)
        if (url.pathname === '/api/catalog/publications')
          return Response.json({
            channel: 'staging-v1',
            channels: [],
            publications: [{ ...publication, revision: 9, current: true }],
            nextBefore: null,
          })
        return Response.json({ defined: false, code: 'NOT_FOUND', message: 'No song in revision 2' }, { status: 404 })
      }),
    )
    mount(<SongProvenance channel="staging-v1" songId="dsng_demo000001" revision={2} />)
    expect((await screen.findByRole('alert')).textContent).toContain('No song in revision 2')
    expect(requests.every((url) => url.searchParams.get('channel') === 'staging-v1')).toBe(true)
    const picker = (await screen.findByLabelText('Publication')) as HTMLSelectElement
    // The revision asked for stays on screen even though the list (newest first) does not include it
    expect(picker.value).toBe('2')
    expect([...picker.options].map((o) => o.value)).toEqual(['9', '2'])
    fireEvent.change(picker, { target: { value: '9' } })
    expect(window.location.hash).toBe('#song?channel=staging-v1&songId=dsng_demo000001&revision=9')
    expect(screen.getByText('Songs').getAttribute('href')).toBe('#songs?channel=staging-v1&revision=2')
  })

  it('shows the song’s lineage, each value with its sources and transforms, and the build inputs', async () => {
    stub(() => Response.json(song))
    mount(<SongProvenance songId="demo-song-1" />)
    expect(await screen.findByRole('heading', { name: 'Demo Song 1' })).toBeTruthy()
    expect(screen.getByText('Regions').parentElement!.textContent).toContain('maimai_cn')
    expect(screen.getByText('Enrichment').parentElement!.textContent).toContain('none recorded')
    const title = screen.getByRole('table', { name: 'song' }).querySelector('tbody tr')!
    expect(title.textContent).toContain('sega_official_jp')
    expect(title.textContent).toContain('viscum_json')
    expect(title.textContent).toContain('normalize_song_identity')
    fireEvent.click(screen.getByRole('tab', { name: 'dx master' }))
    const sheet = (await screen.findByRole('table', { name: 'dx-master' })).textContent
    expect(sheet).toContain('no rule')
    expect(sheet).toContain('Public sheet ID')
    expect(screen.getByText('Demo Song 1', { selector: 'code' })).toBeTruthy()
    expect(screen.getByText('official/jp.json')).toBeTruthy()
    expect(screen.getByText(/100% of 1200 leaf fields traced/)).toBeTruthy()
  })

  it('says when the publication has no manifest, and when the song is missing', async () => {
    stub(() => Response.json({ ...song, manifest: null, lineage: null }))
    mount(<SongProvenance songId="demo-song-1" revision={2} />)
    expect(await screen.findByText(/no provenance manifest/)).toBeTruthy()
    expect(requests.find((u) => u.pathname === '/api/catalog/song')!.searchParams.get('revision')).toBe('2')
    cleanup()
    stub(() =>
      Response.json({ defined: false, code: 'NOT_FOUND', message: 'No song nope in revision 8' }, { status: 404 }),
    )
    mount(<SongProvenance songId="nope" />)
    expect((await screen.findByRole('alert')).textContent).toContain('No song nope in revision 8')
  })
})