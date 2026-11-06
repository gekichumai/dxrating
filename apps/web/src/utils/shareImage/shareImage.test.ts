import { describe, expect, it, vi } from 'vitest'
import {
  coverImageUrl,
  isCanvasSafeImageUrl,
  canShareImageFile,
  copyImage,
  downloadImage,
  shareImageFile,
} from './shareImage'

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

describe('downloadImage', () => {
  it('clicks a download link for the PNG', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    downloadImage(new Blob(['x'], { type: 'image/png' }), 'a.png')
    expect(click).toHaveBeenCalled()
  })
})

describe('shareImageFile', () => {
  it('reports when files cannot be shared', () => {
    Object.assign(navigator, { canShare: undefined })
    expect(canShareImageFile(new Blob(['x']), 'a.png')).toBe(false)
  })
  it('shares when supported', async () => {
    const share = vi.fn(async () => {})
    Object.assign(navigator, { canShare: () => true, share })
    expect(canShareImageFile(new Blob(['x']), 'a.png')).toBe(true)
    expect(await shareImageFile(new Blob(['x']), 'a.png', 't')).toBe('shared')
    expect(share).toHaveBeenCalled()
  })
  it('treats a dismissed sheet as cancelled', async () => {
    Object.assign(navigator, { share: vi.fn(async () => Promise.reject(new DOMException('x', 'AbortError'))) })
    expect(await shareImageFile(new Blob(['x']), 'a.png')).toBe('cancelled')
  })
})

describe('copyImage', () => {
  it('writes a PNG clipboard item', async () => {
    const write = vi.fn(async () => {})
    vi.stubGlobal('ClipboardItem', class {})
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    await copyImage(new Blob(['x'], { type: 'image/png' }))
    expect(write).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})