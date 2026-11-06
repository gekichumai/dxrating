/** The gap between an average's dashed line and its label, in px. */
export const AVERAGE_LABEL_GAP = 4

/**
 * Where to put an average label (with `text-anchor: start`) so it stays inside the plot. The label sits right of its
 * line when it fits, flips to the left when it would run past the right edge, and is clamped to the bounds when it fits
 * on neither side.
 *
 * @param lineX the line's x position
 * @param labelWidth the label's rendered width
 * @param minX the leftmost x the label may start at
 * @param maxX the rightmost x the label may end at
 * @returns the x the label starts at
 */
export const placeAverageLabel = (lineX: number, labelWidth: number, minX: number, maxX: number): number => {
  const right = lineX + AVERAGE_LABEL_GAP
  if (right + labelWidth <= maxX) return right
  const left = lineX - AVERAGE_LABEL_GAP - labelWidth
  if (left >= minX) return left
  // Fits on neither side: keep the whole label in view, favouring its start when even the plot is too narrow
  return Math.max(minX, Math.min(right, maxX - labelWidth))
}

/**
 * A fallback for the label width when the text cannot be measured (no layout yet): a generous per-character width at
 * the given font size, so the estimate errs towards flipping.
 */
export const estimateLabelWidth = (text: string, fontSizePx: number): number => text.length * fontSizePx * 0.62