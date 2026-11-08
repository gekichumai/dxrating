import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRoute, routeHref } from '../route'
import { formatBytes, formatUtc, Publications } from './Publications'

const publication = (revision: number, overrides: Record<string, unknown> = {}) => ({
  revision,
  fingerprint: String(revision).padStart(64, '0'),
  publishedAt: `2026-11-0${revision}T08:00:00.000Z`,
  catalogRunId: String(100 + revision),
  legacyGitCommitSha: null,
  pipelineVersion: 'assembly-line@f8f5640',
  apiSchemaVersion: 1,
  inputFingerprint: 'a'.repeat(64),
  sourceUpdatedAt: '2026-11-01T00:00:00.000Z',
  generatedAt: '2026-11-01T00:00:00.000Z',
  songCount: 1803,
  sheetCount: 7405,
  bodySha256: 'c'.repeat(64),
  byteLength: 9_211_587,
  hasProvenanceManifest: true,
  current: false,
  ...overrides,
})

const requests: URL[] = []
const stub = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string) => {
      requests.push(new URL(input instanceof Request ? input.url : input, 'http://admin.test'))
      return Response.json(body)
    }),
  )

const mount = (props: Parameters<typeof Publications>[0] = {}) =>
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Publications {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  requests.length = 0
})

describe('Publications', () => {
  it('lists publications with the current one marked and a link to the next page', async () => {
    stub({
      channel: 'production-v1',
      channels: ['production-v1'],
      publications: [
        publication(3, { current: true }),
        publication(2, { hasProvenanceManifest: false, legacyGitCommitSha: 'd'.repeat(40) }),
      ],
      nextBefore: 2,
    })
    mount()
    expect(await screen.findByText('r3')).toBeTruthy()
    expect(screen.getByText('current').closest('tr')?.textContent).toContain('r3')
    expect(screen.getByText('2026-11-03 08:00 UTC')).toBeTruthy()
    expect(screen.getByText('git ddddddd').getAttribute('href')).toBe(
      `https://github.com/gekichumai/dxrating/commit/${'d'.repeat(40)}`,
    )
    expect(screen.getByText('none').closest('tr')?.textContent).toContain('r2')
    expect(screen.getByText('Older').closest('a')?.getAttribute('href')).toBe('#publications?before=2')
    expect(screen.queryByText('Newest')).toBeNull()
    expect(requests[0]!.pathname).toBe('/api/catalog/publications')
  })

  it('passes the channel and page through and offers the newest page back', async () => {
    stub({ channel: 'staging-v1', channels: ['production-v1', 'staging-v1'], publications: [], nextBefore: null })
    mount({ channel: 'staging-v1', before: 5 })
    expect((await screen.findByRole('status')).textContent).toContain('No publications on staging-v1')
    expect(requests[0]!.searchParams.get('channel')).toBe('staging-v1')
    expect(requests[0]!.searchParams.get('before')).toBe('5')
    expect(screen.getByText('Newest').closest('a')?.getAttribute('href')).toBe('#publications?channel=staging-v1')
  })

  it('offers no paging while another channel loads, so the old cursor never pairs with the new channel', async () => {
    let release: () => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request | string) => {
        const url = new URL(input instanceof Request ? input.url : input, 'http://admin.test')
        const channel = url.searchParams.get('channel') ?? 'production-v1'
        if (channel === 'staging-v1') await new Promise<void>((resolve) => (release = resolve))
        return Response.json({
          channel,
          channels: ['production-v1', 'staging-v1'],
          publications: [publication(channel === 'staging-v1' ? 4 : 3)],
          nextBefore: channel === 'staging-v1' ? 4 : 3,
        })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = (channel?: string) => (
      <MantineProvider>
        <QueryClientProvider client={client}>
          <Publications channel={channel} />
        </QueryClientProvider>
      </MantineProvider>
    )
    const { rerender } = render(view())
    expect((await screen.findByText('Older')).closest('a')?.getAttribute('href')).toBe('#publications?before=3')
    rerender(view('staging-v1'))
    await waitFor(() => expect(screen.queryByText('Older')).toBeNull())
    expect(screen.getByText('r3')).toBeTruthy()
    // The old rows' links still point at the channel they belong to
    expect(screen.getByText('vs previous').closest('a')?.getAttribute('href')).toBe('#diff?to=3')
    release()
    expect((await screen.findByText('Older')).closest('a')?.getAttribute('href')).toBe(
      '#publications?channel=staging-v1&before=4',
    )
  })

  it('says when the API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ defined: false, code: 'INTERNAL_SERVER_ERROR', message: 'x' }, { status: 500 }),
      ),
    )
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load publications')
  })
})

describe('formatting and routes', () => {
  it('formats sizes and UTC times', () => {
    expect(formatBytes(9_211_587)).toBe('8.78 MB')
    expect(formatBytes(2048)).toBe('2.0 kB')
    expect(formatUtc('2026-11-07T08:05:09.000Z')).toBe('2026-11-07 08:05 UTC')
  })

  it('round-trips a view and its parameters through the hash, and falls back to the overview', () => {
    const route = parseRoute(routeHref('publications', { channel: 'staging-v1', before: 4, skipped: undefined }))
    expect(route.view).toBe('publications')
    expect(Object.fromEntries(route.params)).toEqual({ channel: 'staging-v1', before: '4' })
    expect(parseRoute('#nope').view).toBe('overview')
    expect(parseRoute('').view).toBe('overview')
  })
})