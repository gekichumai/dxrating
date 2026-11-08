/**
 * The colours of the DX and STD chart-type labels, shared by the web app (src/styles/tokens.css and dark.css, checked
 * against this file by a test there), the OG image renderer and, by hand, the iOS app (ChartIndicators.swift,
 * `ChartTypeBadge`).
 *
 * Source: the game's own chart-type plates, the 140 x 52 STD (スタンダード) and DX (でらっくす) icons maimai DX and
 * maimai DX NET show next to every chart, sampled pixel by pixel:
 * - STD: a solid sky-blue plate (#40A8F8) with white lettering.
 * - DX: a white plate with a blue outline (#0078D8) and multicoloured lettering: red #F84040, orange #F8A028, yellow
 *   #F8D800, green #98C848 and cyan #00A8E0.
 *
 * Those plates are artwork, not text, and most of their colours fail WCAG AA as text, so the label colours keep each
 * hue and deepen it to >=4.5:1 against what it sits on:
 * - STD's fill is deepened to #1D6FD8 (white on it: 4.9:1). Where STD is coloured text with no plate, it is a step
 *   deeper again on light surfaces (#1860C0, >=4.8:1 down to #D4ECE0) and the plate's own sky blue on dark ones
 *   (>=5.5:1 on dark glass).
 * - DX's lettering keeps red, orange, green and cyan, each deepened to >=4.9:1 on the white plate. The plate's yellow
 *   cannot reach 4.5:1 on white, so the gradient skips it. Where the lettering sits straight on a surface (no plate),
 *   the same hues go a step deeper on light glass (>=4.6:1 down to #D4ECE0) and are lightened on dark glass
 *   (>=6.5:1).
 */
export const CHART_TYPE_COLORS = {
  std: {
    /** The plate's fill, carrying `ink` */
    fill: '#1D6FD8',
    ink: '#FFFFFF',
    /** STD as coloured text with no plate behind it, on light glass: the fill a step deeper, >=4.8:1 down to #D4ECE0 */
    text: '#1860C0',
    /** …and on dark surfaces: the official plate's own sky blue */
    textDark: '#40A8F8',
  },
  dx: {
    /** The plate is white in light and dark alike, like the game's sticker */
    plate: '#FFFFFF',
    /** The official plate's outline blue (#0078D8 sampled; #007CDB as iOS draws it) */
    outline: '#007CDB',
    /** Red, orange, green and cyan, left to right, each >=4.9:1 on the white plate */
    lettering: ['#D32F2F', '#B35600', '#3E7D1C', '#0277A8'],
    /**
     * The same hues a step deeper, for lettering straight on light glass (no plate): glass tinted by the version
     * colour is darker than white (about #DCF3E8 on MAGiCAL), so each stop keeps >=4.6:1 down to #D4ECE0
     */
    letteringOnSurface: ['#C02A2A', '#A24E00', '#397219', '#016D9A'],
    /** The same hues lightened to >=4.5:1 on dark surfaces, for lettering with no plate behind it */
    letteringDark: ['#FF7A7A', '#FFA94D', '#8BD45A', '#4FC3F7'],
  },
} as const

/** A left-to-right CSS gradient through the given stops, for `background-clip: text` lettering */
export function chartTypeLetteringGradient(stops: readonly string[]): string {
  return `linear-gradient(90deg, ${stops.join(', ')})`
}