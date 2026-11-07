import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Announcements, statusOf, toInput } from './Announcements'

const live = {
  id: 7,
  revision: 2,
  severity: 'warning',
  title: { en: 'Maintenance tonight' },
  body: { en: 'Synthetic body' },
  link: null,
  startsAt: '2020-01-01T00:00:00.000Z',
  endsAt: null,
  platforms: [],
  regions: [],
  minAppVersion: null,
  maxAppVersion: null,
  dismissible: true,
  createdBy: 'human:owner@example.invalid',
  updatedBy: 'agent:coordinator',
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
}

const calls: { path: string; body: unknown }[] = []
const stub = (override?: (path: string, body: unknown) => Response | undefined) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(new URL(input, 'http://admin.test'), init)
      const path = new URL(request.url).pathname
      const body = request.method === 'POST' ? await request.json() : undefined
      calls.push({ path, body })
      const overridden = override?.(path, body)
      if (overridden) return overridden
      if (path === '/api/announcements' && request.method === 'GET') return Response.json({ announcements: [live] })
      if (path === '/api/announcements/end')
        return Response.json({ announcement: { ...live, endsAt: live.startsAt }, edgeCache: 'invalidated' })
      return Response.json({
        dryRun: (body as { dryRun?: boolean }).dryRun ?? false,
        preview: {
          title: { en: { text: 'Hello', from: 'en' }, ja: { text: 'Hello', from: 'en' } },
          body: { en: { text: 'World', from: 'en' }, ja: { text: 'World', from: 'en' } },
          linkLabel: { en: { text: 'More', from: 'en' }, ja: { text: 'More', from: 'en' } },
        },
        announcement: null,
        edgeCache: 'skipped',
      })
    }),
  )

const mount = (canWrite = true) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Announcements canWrite={canWrite} />
    </QueryClientProvider>,
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  calls.length = 0
})

describe('announcements page', () => {
  it('lists announcements with status, revision and author', async () => {
    stub()
    mount()
    expect(await screen.findByText('Maintenance tonight')).toBeTruthy()
    expect(screen.getByText('live')).toBeTruthy()
    expect(screen.getByText('r2 · agent:coordinator')).toBeTruthy()
  })

  it('previews with a dry run and shows which languages fall back', async () => {
    stub()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'New announcement' }))
    fireEvent.change(screen.getByLabelText('Title (en)'), { target: { value: 'Hello' } })
    fireEvent.change(screen.getByLabelText('Body (en)'), { target: { value: 'World' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const preview = (await screen.findByLabelText('Preview')).textContent
    expect(preview).toContain('(title from en)')
    expect(preview).toContain('(body from en)')
    expect(preview).toContain('Link: More (from en)')
    expect(calls.at(-1)).toMatchObject({
      path: '/api/announcements',
      body: { dryRun: true, announcement: { title: { en: 'Hello' } } },
    })
  })

  it('says when a far-off scheduled notice reaches clients', async () => {
    stub()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'New announcement' }))
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000)
    const local = new Date(inThreeDays.getTime() - inThreeDays.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    fireEvent.change(screen.getByLabelText('Starts (empty: now)'), { target: { value: local } })
    expect(screen.getByRole('note').textContent).toContain('24 hours before it starts')
  })

  it('ends an announcement after confirming', async () => {
    stub()
    vi.stubGlobal('confirm', () => true)
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'End' }))
    await waitFor(() => expect(calls.some((c) => c.path === '/api/announcements/end')).toBe(true))
    expect(calls.find((c) => c.path === '/api/announcements/end')?.body).toEqual({ id: 7 })
    expect((await screen.findByRole('status')).textContent).toContain(
      'Ended “Maintenance tonight”. Edge cache: invalidated.',
    )
  })

  it('saves an edit with the updatedAt it was read at, and shows a conflict', async () => {
    stub((path) =>
      path === '/api/announcements/update'
        ? Response.json(
            {
              defined: false,
              code: 'CONFLICT',
              message: 'Someone saved this announcement since you opened it; reload it',
            },
            { status: 409 },
          )
        : undefined,
    )
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toContain('CONFLICT')
    expect(calls.find((c) => c.path === '/api/announcements/update')?.body).toMatchObject({
      ifUpdatedAt: live.updatedAt,
      announcement: { id: 7 },
    })
  })

  it('offers no writes to a read-only principal', async () => {
    stub()
    mount(false)
    expect(await screen.findByText('Maintenance tonight')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New announcement' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'End' })).toBeNull()
  })
})

describe('helpers', () => {
  it('drops an empty link and blank versions', () => {
    const input = toInput({
      severity: 'info',
      title: { en: 'a' },
      body: { en: 'b' },
      linkUrl: ' ',
      linkLabel: {},
      startsAt: '',
      endsAt: '',
      platforms: [],
      regions: [],
      minAppVersion: ' ',
      maxAppVersion: '',
      dismissible: true,
    })
    expect(input).toMatchObject({ link: null, startsAt: null, endsAt: null, minAppVersion: null, maxAppVersion: null })
  })
  it('derives status from the window', () => {
    const now = Date.parse('2026-01-02T00:00:00Z')
    expect(statusOf({ startsAt: '2026-01-03T00:00:00Z', endsAt: null }, now)).toBe('scheduled')
    expect(statusOf({ startsAt: '2026-01-01T00:00:00Z', endsAt: null }, now)).toBe('live')
    expect(statusOf({ startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-01T12:00:00Z' }, now)).toBe('ended')
  })
})