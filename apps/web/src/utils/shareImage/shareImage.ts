/**
 * Client-side share images, drawn on a canvas only: no third-party libraries or origins, so the CSP holds.
 *
 * A canvas becomes tainted (and `toBlob` throws) once a cross-origin image without CORS is drawn. Cover art is served
 * by https://shama.dxrating.net (allowed in img-src / connect-src), which answers `Access-Control-Allow-Origin: *`
 * only when the request carries an `Origin` header. So covers are loaded with `crossOrigin = 'anonymous'`; because a
 * copy cached earlier by a plain <img> may lack the CORS header, a failed load is retried once with a cache-busting
 * query, and an image that still fails is skipped (the caller draws a placeholder) instead of tainting the canvas.
 */

export const COVER_ORIGIN = 'https://shama.dxrating.net'

export const coverImageUrl = (imageName: string) => `${COVER_ORIGIN}/images/cover/v2/${imageName}.jpg`

/** Same-origin URLs, data/blob URLs and the CORS-enabled cover host are safe to draw */
export function isCanvasSafeImageUrl(url: string, pageOrigin: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true
  try {
    const { origin } = new URL(url, pageOrigin)
    return origin === pageOrigin || origin === COVER_ORIGIN
  } catch {
    return false
  }
}

function loadImageOnce(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

/** Loads an image that can be drawn without tainting the canvas, or null */
export async function loadCanvasImage(url: string): Promise<HTMLImageElement | null> {
  if (!isCanvasSafeImageUrl(url, window.location.origin)) return null
  const image = await loadImageOnce(url)
  if (image) return image
  if (url.startsWith('data:') || url.startsWith('blob:')) return null
  const retry = new URL(url, window.location.origin)
  retry.searchParams.set('cors', '1')
  return loadImageOnce(retry.toString())
}

export interface ShareImageSpec {
  /** CSS pixel size of the image */
  width: number
  height: number
  /** Device pixel scale of the output; defaults to 2 */
  scale?: number
  draw: (context: CanvasRenderingContext2D, size: { width: number; height: number }) => void | Promise<void>
}

/** Draws a share image and encodes it as PNG */
export async function renderShareImage({ width, height, scale = 2, draw }: ShareImageSpec): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context unavailable')
  context.scale(scale, scale)
  await document.fonts?.ready
  await draw(context, { width, height })
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
  })
}

/** Path of a rounded rectangle (radius in CSS pixels) */
export function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

/** Draws an image clipped to a rounded rectangle, or a translucent placeholder when it is missing */
export function drawRoundedImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource | null,
  x: number,
  y: number,
  size: number,
  radius = 8,
) {
  context.save()
  roundedRectPath(context, x, y, size, size, radius)
  context.clip()
  if (image) {
    context.drawImage(image, x, y, size, size)
  } else {
    context.fillStyle = 'rgba(127, 127, 127, 0.25)'
    context.fillRect(x, y, size, size)
  }
  context.restore()
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Opens the Web Share sheet with the PNG when the browser can share files, otherwise downloads it */
export async function shareOrDownloadImage(blob: Blob, filename: string, title?: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Fall back to a download when sharing fails for any other reason
    }
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}