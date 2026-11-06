/**
 * One look for the table share images (plate progress and level completion): Torus, a 48px frame, a translucent
 * panel like the page's glass, and a background and progress colour taken from the current version accent.
 */
import { roundedRectPath } from '@/utils/shareImage/shareImage'

export const SHARE_FONT = 'Torus, -apple-system, "Hiragino Sans", "PingFang SC", "Noto Sans CJK JP", sans-serif'
export const SHARE_PADDING = 48
export const SHARE_RADIUS = 12
const BASE = '#0f172a'
const FALLBACK_ACCENT = '#178c72'

/** The version accent set on <html> by the root route (read at draw time, client only) */
export const readAccent = () => {
  if (typeof document === 'undefined') return FALLBACK_ACCENT
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return value || FALLBACK_ACCENT
}

/** A dark base with the accent washed over it at 35%, fading out toward the bottom right */
export function paintShareBackground(context: CanvasRenderingContext2D, width: number, height: number, accent: string) {
  context.fillStyle = BASE
  context.fillRect(0, 0, width, height)
  const wash = context.createLinearGradient(0, 0, width, height)
  wash.addColorStop(0, accent)
  wash.addColorStop(1, BASE)
  context.globalAlpha = 0.35
  context.fillStyle = wash
  context.fillRect(0, 0, width, height)
  context.globalAlpha = 1
}

/** The translucent panel inset by half the padding, echoing the glass surface of the page */
export function paintSharePanel(context: CanvasRenderingContext2D, width: number, height: number) {
  const inset = SHARE_PADDING / 2
  roundedRectPath(context, inset, inset, width - inset * 2, height - inset * 2, SHARE_RADIUS)
  context.fillStyle = 'rgba(255, 255, 255, 0.08)'
  context.fill()
  context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  context.lineWidth = 1
  context.stroke()
}