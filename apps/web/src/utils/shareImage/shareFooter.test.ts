import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { QR_QUIET_ZONE, shareLink, shareQrModules, shareQrModuleSize } from './shareFooter'

/** Device pixel scale of the exported PNG (renderShareImage's default) */
const EXPORT_SCALE = 2

/** Rasterizes the QR exactly as the footer draws it: whole-pixel modules, dark on white, at export resolution */
function rasterize(modules: boolean[][]) {
  const modulePx = shareQrModuleSize(modules.length) * EXPORT_SCALE
  const size = modules.length * modulePx
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[Math.floor(y / modulePx)][Math.floor(x / modulePx)]) continue
      const offset = (y * size + x) * 4
      pixels[offset] = 11
      pixels[offset + 1] = 16
      pixels[offset + 2] = 32
    }
  }
  return { pixels, size }
}

const decode = (url: string) => {
  const { pixels, size } = rasterize(shareQrModules(url))
  return jsQR(pixels, size, size, { inversionAttempts: 'dontInvert' })?.data
}

describe('shareLink', () => {
  it('prints the short path and keeps view state in the QR URL only', () => {
    expect(shareLink('/constants/14')).toEqual({
      url: 'https://dxrating.net/constants/14',
      display: 'dxrating.net/constants/14',
    })
    expect(shareLink('/constants/14p', { target: 'ap', unused: undefined })).toEqual({
      url: 'https://dxrating.net/constants/14p?target=ap',
      display: 'dxrating.net/constants/14p',
    })
  })
})

describe('share footer QR', () => {
  const links = [
    shareLink('/constants/14'),
    shareLink('/constants/14p', { target: 'fsdp' }),
    shareLink('/plates/%E6%A5%B5', { region: 'cn' }),
    shareLink('/me/records', { tab: 'dx_score', sort: 'achievement', level: '13+' }),
  ]

  it.each(links)('decodes to the printed URL at export resolution: $display', ({ url, display }) => {
    const decoded = decode(url)
    expect(decoded).toBe(url)
    const parsed = new URL(decoded!)
    expect(`${parsed.host}${parsed.pathname}`).toBe(display)
  })

  it('keeps the quiet zone and modules of at least 3 device pixels', () => {
    for (const { url } of links) {
      const modules = shareQrModules(url)
      for (const row of [...modules.slice(0, QR_QUIET_ZONE), ...modules.slice(-QR_QUIET_ZONE)]) {
        expect(row.every((dark) => !dark)).toBe(true)
      }
      expect(shareQrModuleSize(modules.length) * EXPORT_SCALE).toBeGreaterThanOrEqual(3)
    }
  })
})