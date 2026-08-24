import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createAdminTestRuntime, renderAdminApp } from '../test/render-admin-app'

const activeUser = {
  userId: 'user-alpha',
  displayName: 'Alpha User',
  email: 'alpha@example.test',
  emailVerified: true,
  effectiveRole: 'user' as const,
  accountStatus: { status: 'active' as const },
}

const bannedAdministrator = {
  userId: 'administrator-bravo',
  displayName: 'Bravo Moderator',
  email: 'bravo@example.test',
  emailVerified: false,
  effectiveRole: 'admin' as const,
  accountStatus: {
    status: 'temporarily_banned' as const,
    expiresAt: '2026-08-25T12:00:00.000Z',
  },
}

const searchResponse = (
  items: readonly (typeof activeUser | typeof bannedAdministrator)[],
  nextCursor: string | null,
) => Response.json({ items, nextCursor })

const requestBody = async (fetch: ReturnType<typeof vi.fn>, index: number): Promise<Record<string, unknown>> => {
  const request = fetch.mock.calls[index]?.[0] as Request
  return (await request.clone().json()) as Record<string, unknown>
}

describe('administrator user search route', () => {
  it('restores combinable normalized URL filters and renders only approved result fields', async () => {
    const fetch = vi.fn(async () => searchResponse([bannedAdministrator], null))
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })

    await renderAdminApp(
      '/users?displayName=%20%20Bravo%20%20Moderator%20&email=BRAVO%40EXAMPLE.TEST&effectiveRole=admin&activeBan=true',
      { runtime },
    )

    expect(await screen.findByText('Bravo Moderator')).toBeTruthy()
    expect(screen.getByText('bravo@example.test')).toBeTruthy()
    expect(screen.getByText('Email not verified')).toBeTruthy()
    expect(screen.getByText(/Banned until/)).toBeTruthy()
    expect(screen.queryByText(/moderation reason/i)).toBeNull()

    const detailLink = screen.getByRole('link', { name: 'Open details' })
    expect(detailLink.getAttribute('href')).toBe('/users/administrator-bravo')
    expect(await requestBody(fetch, 0)).toEqual({
      displayName: 'Bravo Moderator',
      email: 'bravo@example.test',
      effectiveRole: 'admin',
      activeBan: true,
    })
  })

  it('validates drafts and clears a keyset cursor whenever filters are submitted', async () => {
    const fetch = vi.fn(async () => searchResponse([], null))
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp('/users?displayName=Moderator&cursor=opaque_page_2', { runtime })

    expect(await screen.findByText('No matching users')).toBeTruthy()
    const displayName = screen.getByRole('textbox', { name: 'Display name starts with' })
    await user.clear(displayName)
    await user.type(displayName, 'x')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('Enter between 2 and 255 characters.')).toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()

    await user.clear(displayName)
    await user.type(displayName, '  Full   Name  ')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(rendered.router.state.location.search).toEqual({ displayName: 'Full Name' })
    expect(await requestBody(fetch, 1)).toEqual({ displayName: 'Full Name' })
  })

  it('pushes opaque Next cursors into browser history and lets Back restore the cached page', async () => {
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const body = (await (request as Request).clone().json()) as { cursor?: string }
      return body.cursor === 'opaque_page_2'
        ? searchResponse([bannedAdministrator], null)
        : searchResponse([activeUser], 'opaque_page_2')
    })
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp('/users?effectiveRole=user', { runtime })

    expect(await screen.findByText('Alpha User')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('Bravo Moderator')).toBeTruthy()
    expect(rendered.router.state.location.search).toEqual({ effectiveRole: 'user', cursor: 'opaque_page_2' })
    expect(await requestBody(fetch, 1)).toEqual({ effectiveRole: 'user', cursor: 'opaque_page_2' })

    rendered.router.history.back()
    await waitFor(() => expect(rendered.router.state.location.search).toEqual({ effectiveRole: 'user' }))
    expect(await screen.findByText('Alpha User')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('clears an unsaved draft even when the current URL has no filters', async () => {
    const fetch = vi.fn(async () => searchResponse([], null))
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    await renderAdminApp('/users', { runtime })

    expect(await screen.findByText('No matching users')).toBeTruthy()
    const userId = screen.getByRole('textbox', { name: 'Stable user ID' }) as HTMLInputElement
    const clear = screen.getByRole('button', { name: 'Clear filters' }) as HTMLButtonElement
    expect(clear.disabled).toBe(true)

    await user.type(userId, 'unsaved-user-id')
    expect(clear.disabled).toBe(false)
    await user.click(clear)

    expect(userId.value).toBe('')
    expect(clear.disabled).toBe(true)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('shows loading, empty, network recovery, and stale-cursor recovery states', async () => {
    let rejectRequest: ((error: Error) => void) | undefined
    const fetch = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectRequest = reject
        }),
    )
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const rendered = await renderAdminApp('/users?cursor=opaque_page_2', { runtime })

    expect(await screen.findByText('Loading matching users')).toBeTruthy()
    rejectRequest?.(new Error('offline'))

    expect(await screen.findByText('Connection failed')).toBeTruthy()
    expect(screen.getByText('This result position cannot be used. Restart from the first matching page.')).toBeTruthy()
    screen.getByRole('button', { name: 'Restart results' }).click()
    await waitFor(() => expect(rendered.router.state.location.search).toEqual({}))
  })
})