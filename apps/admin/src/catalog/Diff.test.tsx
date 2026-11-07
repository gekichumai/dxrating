import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Diff, type DiffParams } from './Diff'

const side = (revision: number) => ({
  revision,
  fingerprint: String(revision).padStart(64, '0'),
  publishedAt: `2026-11-0${revision}T08:00:00.000Z`,
  bodySha256: String(revision).padStart(64, 'c'),
})

const diff = {
  channel: 'production-v1',
  from: side(2),
  to: side(3),
  summary: {
    songsAdded: 1,
    songsRemoved: 0,
    songsChanged: 1,
    sheetsAdded: 4,
    sheetsRemoved: 0,
    sheetsChanged: 1,
    fieldChanges: 2,
  },
  pathCounts: [
    { path: 'sheets[].internalLevelValue', count: 1 },
    { path: 'sheets[].comment', count: 1 },
  ],
  lists: [{ key: 'versions', beforeCount: 1, afterCount: 2, added: [{ version: 'CiRCLE' }], removed: [] }],
  updateTime: { before: 'a', after: 'b' },
  path: null,
  songsTotal: 2,
  songs: [
    {
      songId: 'synthetic-changed',
      title: 'Synthetic Changed',
      kind: 'changed',
      fields: [],
      sheets: [
        {
          type: 'dx',
          difficulty: 'master',
          kind: 'changed',
          fields: [
            { path: 'internalLevelValue', before: 13.5, after: 13.7 },
            { path: 'comment', after: 'synthetic note' },
          ],
        },
      ],
    },
    {
      songId: 'synthetic-new',
      title: 'Synthetic New',
      kind: 'added',
      fields: [],
      sheets: [{ type: 'dx', difficulty: 'basic', kind: 'added', fields: [] }],
    },
  ],
  nextOffset: 50,
}

const requests: URL[] = []
const stub = (diffResponse: () => Response) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string) => {
      const url = new URL(input instanceof Request ? input.url : input, 'http://admin.test')
      requests.push(url)
      if (url.pathname === '/api/catalog/publications')
        return Response.json({ channel: 'production-v1', channels: [], publications: [], nextBefore: null })
      return diffResponse()
    }),
  )

const mount = (props: DiffParams = {}) =>
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Diff {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  requests.length = 0
})

describe('Diff', () => {
  it('shows the summary, field filters, list changes and each change with before and after', async () => {
    stub(() => Response.json(diff))
    mount()
    expect(await screen.findByText('Synthetic Changed')).toBeTruthy()
    expect(screen.getByText('+1 songs')).toBeTruthy()
    expect(screen.queryByText(/−0/)).toBeNull()
    expect(screen.getByText('sheets[].internalLevelValue · 1').closest('a')?.getAttribute('href')).toBe(
      `#diff?path=${encodeURIComponent('sheets[].internalLevelValue')}`,
    )
    const level = screen.getByText('internalLevelValue').closest('tr')!
    expect(level.textContent).toContain('dx master')
    expect(level.textContent).toContain('13.5')
    expect(level.textContent).toContain('13.7')
    // A field that did not exist before says so, rather than showing an empty or null value
    expect(screen.getByText('comment').closest('tr')!.textContent).toContain('absent')
    expect(screen.getByText('sheet added').closest('tr')!.textContent).toContain('dx basic')
    expect(screen.getByText('versions').closest('p')?.textContent).toContain('CiRCLE')
    expect(screen.getByText('Next 50').closest('a')?.getAttribute('href')).toBe('#diff?offset=50')
  })

  it('sends the revisions, path and page it was opened with, and offers to clear the filter', async () => {
    stub(() => Response.json({ ...diff, path: 'sheets[].comment', nextOffset: null }))
    mount({ from: 1, to: 3, path: 'sheets[].comment', offset: 50 })
    expect(await screen.findByText('All changes')).toBeTruthy()
    const call = requests.find((url) => url.pathname === '/api/catalog/diff')!
    expect(Object.fromEntries(call.searchParams)).toMatchObject({
      from: '1',
      to: '3',
      path: 'sheets[].comment',
      offset: '50',
    })
    expect(screen.getByText('All changes').closest('a')?.getAttribute('href')).toBe('#diff?from=1&to=3')
    expect(screen.getByText('Previous 50').closest('a')?.getAttribute('href')).toBe(
      `#diff?from=1&to=3&path=${encodeURIComponent('sheets[].comment')}`,
    )
  })

  it('offers no paging while another filter loads', async () => {
    let release: () => void = () => {}
    stub(() => Response.json(diff))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = (props: DiffParams) => (
      <MantineProvider>
        <QueryClientProvider client={client}>
          <Diff {...props} />
        </QueryClientProvider>
      </MantineProvider>
    )
    const { rerender } = render(view({}))
    expect(await screen.findByText('Next 50')).toBeTruthy()
    stub(() => Response.json(diff))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return Response.json({ ...diff, path: 'sheets[].comment', nextOffset: null })
      }),
    )
    rerender(view({ path: 'sheets[].comment' }))
    await waitFor(() => expect(screen.queryByText('Next 50')).toBeNull())
    release()
    expect(await screen.findByText('All changes')).toBeTruthy()
  })

  it('explains a missing revision apart from a failure', async () => {
    stub(() =>
      Response.json(
        { defined: false, code: 'NOT_FOUND', message: 'Revision 1 is the first publication' },
        { status: 404 },
      ),
    )
    mount({ to: 1 })
    expect((await screen.findByRole('alert')).textContent).toContain('Revision 1 is the first publication')
  })
})