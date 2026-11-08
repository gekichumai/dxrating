/**
 * The branded footer of the share images: the DXRating logo, a short URL that reopens the view, and a QR code of
 * that URL, on a translucent band like the OG card's footer. The QR is encoded in the browser (uqr, no network), and
 * the logo comes from the cover host already allowed by the CSP and drawn CORS-clean by `loadCanvasImage`.
 */
import { encode } from 'uqr'
import { COVER_ORIGIN, loadCanvasImage, roundedRectPath } from './shareImage'

export const SHARE_SITE_ORIGIN = 'https://dxrating.net'
/** The OG card's logo */
export const SHARE_LOGO_URL = `${COVER_ORIGIN}/favicon/pack/v1/apple-touch-icon.png`

const BAND_HEIGHT = 128
const BAND_GAP = 16
/** Height the footer adds below the content: a gap, then the band (the image's own bottom padding comes after) */
export const SHARE_FOOTER_HEIGHT = BAND_GAP + BAND_HEIGHT
const BAND_RADIUS = 12
const INNER = 12
const LOGO = 56
/** Largest QR tile (CSS px); the module size is a whole number of CSS px so modules land on device pixels */
const QR_MAX = BAND_HEIGHT - INNER * 2
/** The quiet zone the QR spec asks for, in modules */
export const QR_QUIET_ZONE = 4

export interface ShareLink {
  /** Absolute URL the QR encodes: the printed path plus any view state */
  url: string
  /** The printed short form, without scheme or query, e.g. `dxrating.net/constants/14` */
  display: string
}

/**
 * Builds the link of a share image from a site path and optional view state. The QR carries the state (e.g.
 * `?target=ap`) so a scan reopens the same view; the printed text stays the short, typable path.
 */
export function shareLink(path: string, search: Record<string, string | undefined> = {}): ShareLink {
  const url = new URL(path, SHARE_SITE_ORIGIN)
  for (const [key, value] of Object.entries(search)) if (value) url.searchParams.set(key, value)
  return { url: url.toString(), display: `${url.host}${url.pathname}` }
}

/** QR modules of a URL, dark = true, with the quiet zone included; medium error correction */
export function shareQrModules(url: string): boolean[][] {
  return encode(url, { ecc: 'M', border: QR_QUIET_ZONE }).data
}

/** The whole-pixel module size (CSS px) a QR of this many modules gets in the footer */
export const shareQrModuleSize = (moduleCount: number) => Math.max(2, Math.floor(QR_MAX / moduleCount))

export const loadShareLogo = () => loadCanvasImage(SHARE_LOGO_URL)

export interface ShareFooterInput {
  link: ShareLink
  /** A short localized line under the URL, e.g. "Scan to open on DXRating" */
  caption: string
  logo: HTMLImageElement | null
  font: string
}

/** Draws the QR dark-on-white on a rounded tile whose padding is the quiet zone */
function drawQr(context: CanvasRenderingContext2D, modules: boolean[][], x: number, y: number, moduleSize: number) {
  const size = modules.length * moduleSize
  context.fillStyle = '#ffffff'
  roundedRectPath(context, x, y, size, size, 8)
  context.fill()
  context.fillStyle = '#0b1020'
  modules.forEach((row, rowIndex) =>
    row.forEach((dark, columnIndex) => {
      if (dark) context.fillRect(x + columnIndex * moduleSize, y + rowIndex * moduleSize, moduleSize, moduleSize)
    }),
  )
}

/**
 * Draws the footer band `SHARE_FOOTER_HEIGHT` px tall from `top`, inset by `inset` on both sides: logo, URL and
 * caption on the left, the QR on the right, like the OG card's logo-and-URL corner mark.
 */
export function drawShareFooter(
  context: CanvasRenderingContext2D,
  { top, width, inset }: { top: number; width: number; inset: number },
  { link, caption, logo, font }: ShareFooterInput,
) {
  const bandY = top + BAND_GAP
  const bandWidth = width - inset * 2

  context.save()
  roundedRectPath(context, inset, bandY, bandWidth, BAND_HEIGHT, BAND_RADIUS)
  context.fillStyle = 'rgba(255, 255, 255, 0.07)'
  context.fill()
  context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  context.lineWidth = 1
  context.stroke()

  const modules = shareQrModules(link.url)
  const moduleSize = shareQrModuleSize(modules.length)
  const qrSize = modules.length * moduleSize
  const qrX = inset + bandWidth - INNER - qrSize
  drawQr(context, modules, qrX, bandY + (BAND_HEIGHT - qrSize) / 2, moduleSize)

  // Logo, then the wordmark and caption
  const centerY = bandY + BAND_HEIGHT / 2
  let textX = inset + 20
  if (logo) {
    context.save()
    roundedRectPath(context, textX, centerY - LOGO / 2, LOGO, LOGO, 12)
    context.clip()
    context.drawImage(logo, textX, centerY - LOGO / 2, LOGO, LOGO)
    context.restore()
    textX += LOGO + 16
  }
  const textRight = qrX - 24
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'
  context.fillStyle = '#ffffff'
  context.font = `700 30px ${font}`
  context.fillText(fit(context, link.display, textRight - textX), textX, centerY - 4)
  context.font = `400 20px ${font}`
  context.fillStyle = 'rgba(255, 255, 255, 0.68)'
  context.fillText(fit(context, caption, textRight - textX), textX, centerY + 26)
  context.restore()
}

function fit(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--
  return `${text.slice(0, end)}…`
}