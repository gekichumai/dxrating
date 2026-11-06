import { describe, expect, it, vi } from 'vitest'
import { coverImageUrl, isCanvasSafeImageUrl, shareOrDownloadImage } from './shareImage'

describe('isCanvasSafeImageUrl', () => {
  const page = 'https://dxrating.net'
  it('allows same-origin, data, blob and the cover host', () => {
    expect(isCanvasSafeImageUrl('/logo.png', page)).toBe(true)
    expect(isCanvasSafeImageUrl('data:image/png;base64,AA', page)).toBe(true)
    expect(isCanvasSafeImageUrl('blob:https://dxrating.net/x', page)).toBe(true)
    expect(isCanvasSafeImageUrl(coverImageUrl('abc'), page)).toBe(true)
  })
  it('rejects other origins', () => {
    expect(isCanvasSafeImageUrl('https://example.com/a.png', page)).toBe(false)
  })
})

describe('shareOrDownloadImage', () => {
  it('downloads when files cannot be shared', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const outcome = await shareOrDownloadImage(new Blob(['x'], { type: 'image/png' }), 'a.png')
    expect(outcome).toBe('downloaded')
    expect(click).toHaveBeenCalled()
  })
  it('shares when supported', async () => {
    const share = vi.fn(async () => {})
    Object.assign(navigator, { canShare: () => true, share })
    expect(await shareOrDownloadImage(new Blob(['x']), 'a.png', 't')).toBe('shared')
    expect(share).toHaveBeenCalled()
  })
})