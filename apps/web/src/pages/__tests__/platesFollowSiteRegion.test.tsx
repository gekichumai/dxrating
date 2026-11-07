import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFollowSiteRegion } from '../PlatesPage'

const { context, navigate } = vi.hoisted(() => ({
  context: { region: 'jp', hydrated: false },
  navigate: vi.fn(),
}))
vi.mock('@/models/context/useAppContext', () => ({ useAppContext: () => context }))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ navigate }),
}))

beforeEach(() => window.history.replaceState(null, '', '/plates'))
afterEach(() => navigate.mockReset())

const render = (props: Parameters<typeof useFollowSiteRegion>[0]) =>
  renderHook((p: Parameters<typeof useFollowSiteRegion>[0]) => useFollowSiteRegion(p), { initialProps: props })

describe('Plates following the header region', () => {
  it('waits for the stored choice, then follows it on load', () => {
    context.region = 'jp'
    context.hydrated = false
    const hook = render({ region: 'jp', explicit: false })
    expect(navigate).not.toHaveBeenCalled()

    context.region = 'intl'
    context.hydrated = true
    hook.rerender({ region: 'jp', explicit: false })
    expect(navigate).toHaveBeenCalledWith({ href: '/plates?region=intl', replace: true })
  })

  it('follows a header switch even when another tab stored a different region', () => {
    // This tab's context says International (already hydrated); what storage holds does not matter
    context.region = 'intl'
    context.hydrated = true
    const hook = render({ region: 'intl', explicit: true })
    expect(navigate).not.toHaveBeenCalled()

    context.region = 'cn'
    hook.rerender({ region: 'intl', explicit: true })
    expect(navigate).toHaveBeenCalledWith({ href: '/plates?region=cn', replace: true })
  })

  it('keeps a region the URL names on load, and the other query parameters on a switch', () => {
    window.history.replaceState(null, '', '/plates?region=jp&locale=ja')
    context.region = 'intl'
    context.hydrated = true
    const hook = render({ region: 'jp', explicit: true })
    expect(navigate).not.toHaveBeenCalled()

    context.region = 'cn'
    hook.rerender({ region: 'jp', explicit: true })
    expect(navigate).toHaveBeenCalledWith({ href: '/plates?region=cn&locale=ja', replace: true })
  })

  it('follows again when history brings back a URL without a region while the page stays mounted', () => {
    context.region = 'intl'
    context.hydrated = true
    const hook = render({ region: 'intl', explicit: true })
    expect(navigate).not.toHaveBeenCalled()

    // Back to /plates: the loader renders Japan, the header still says International
    window.history.replaceState(null, '', '/plates')
    hook.rerender({ region: 'jp', explicit: false })
    expect(navigate).toHaveBeenCalledWith({ href: '/plates?region=intl', replace: true })
  })
})