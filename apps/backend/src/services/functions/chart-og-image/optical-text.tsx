import type { CSSProperties } from 'react'

/**
 * Ink extents of the NewRodinProDB glyphs the level numbers use, in 1/1000 em, measured from the font's outlines
 * (fontTools BoundsPen on NewRodinProDB.otf, unitsPerEm 1000): `lsb` is the left side bearing, `ink` the ink width, and
 * `low` the ink's left and right edges from the origin within 0–200 units above the baseline (FreeType raster at 1000
 * px), the band where smaller text set on the same baseline sits.
 *
 * The font only has tabular figures (every digit advances 816 units, no `pnum`, and neither `kern` nor `palt` covers
 * digits), so a "1" sits in a cell twice as wide as its stem and opens holes in "13.4". Setting each glyph from its ink
 * instead gives proportional figures, and lets the first glyph's ink sit exactly on the column edge.
 */
const NEW_RODIN_INK: Record<string, { lsb: number; ink: number; low: [number, number] }> = {
  '0': { lsb: 55, ink: 699, low: [64, 744] },
  '1': { lsb: 169, ink: 327, low: [376, 495] },
  '2': { lsb: 63, ink: 688, low: [63, 744] },
  '3': { lsb: 57, ink: 698, low: [58, 754] },
  '4': { lsb: 30, ink: 753, low: [30, 782] },
  '5': { lsb: 67, ink: 688, low: [67, 753] },
  '6': { lsb: 56, ink: 706, low: [64, 760] },
  '7': { lsb: 69, ink: 680, low: [120, 414] },
  '8': { lsb: 46, ink: 722, low: [46, 767] },
  '9': { lsb: 54, ink: 701, low: [61, 744] },
  '.': { lsb: 49, ink: 152, low: [49, 200] },
  '+': { lsb: 34, ink: 578, low: [276, 369] },
  '?': { lsb: 34, ink: 718, low: [294, 451] },
  L: { lsb: 81, ink: 625, low: [81, 705] },
  v: { lsb: 14, ink: 632, low: [174, 488] },
}

/** The space between two glyphs' ink, in em */
const INK_GAP = 0.085
/**
 * A dot reads as a gap of its own, so the ink around it is set a little tighter than between two figures (judged on the
 * blurred render: at the full gap "13.4" splits into "13" and "4")
 */
const DOT_GAP = 0.06
/** The vertical stem of "1" and "L" has no rounded overshoot, so a gap next to it looks wider than the same gap next to a bowl */
const STEM_GAP = 0.07

const STEMS = new Set(['1', 'L'])

function gapBetween(left: string, right: string) {
  if (left === '.' || right === '.') return DOT_GAP
  if (STEMS.has(left) || STEMS.has(right)) return STEM_GAP
  return INK_GAP
}

/**
 * How far, in em, the first glyph's ink near the baseline starts inside its full ink (`left`), and the last glyph's
 * ends inside it (`right`), halved: an open shape such as the foot of "7" or the stem under the flag of "1" leaves white
 * space by the baseline, so text set next to it on the same baseline is moved in by half of that space. Half, because
 * judged on a blurred render the full amount tucks the neighbour under the arm of the "7".
 */
export function baselineInsets(text: string) {
  const chars = [...text]
  const first = NEW_RODIN_INK[chars[0] ?? '']
  const last = NEW_RODIN_INK[chars.at(-1) ?? '']
  if (!first || !last) return { left: 0, right: 0 }
  return {
    left: (first.low[0] - first.lsb) / 2000,
    right: (last.lsb + last.ink - last.low[1]) / 2000,
  }
}

/** Whether every character has measured ink, so the text can be set glyph by glyph */
export function hasMeasuredInk(text: string) {
  return [...text].every((char) => char in NEW_RODIN_INK)
}

/**
 * The positions of each glyph's box when `text` is set ink to ink at `fontSize`: `left` is where the glyph's origin goes
 * (so its ink starts at `inkLeft`), and `width` is the run's total ink width. The first glyph's ink starts at 0.
 */
export function layoutInk(text: string, fontSize: number) {
  const chars = [...text]
  const glyphs: Array<{ char: string; left: number; inkLeft: number; inkWidth: number }> = []
  let cursor = 0
  chars.forEach((char, index) => {
    const metrics = NEW_RODIN_INK[char]!
    if (index > 0) cursor += gapBetween(chars[index - 1]!, char) * fontSize
    glyphs.push({
      char,
      left: cursor - (metrics.lsb / 1000) * fontSize,
      inkLeft: cursor,
      inkWidth: (metrics.ink / 1000) * fontSize,
    })
    cursor += (metrics.ink / 1000) * fontSize
  })
  return { glyphs, width: cursor }
}

/**
 * Text in NewRodinProDB set from its measured ink: proportional figures, and no side bearing before the first glyph or
 * after the last, so the box is exactly the ink's width. Falls back to plain text for a character without metrics.
 */
export function InkText({ text, fontSize, style }: { text: string; fontSize: number; style: CSSProperties }) {
  if (!hasMeasuredInk(text)) return <div style={{ ...style, fontSize, whiteSpace: 'nowrap' }}>{text}</div>
  const { glyphs, width } = layoutInk(text, fontSize)
  return (
    <div
      style={{
        ...style,
        fontSize,
        position: 'relative',
        display: 'flex',
        flexShrink: 0,
        width: Math.round(width),
        height: Math.round(fontSize * (style.lineHeight === 1 ? 1 : 1.2)),
      }}
    >
      {glyphs.map((glyph, index) => (
        <div
          key={index}
          style={{ position: 'absolute', top: 0, left: Math.round(glyph.left * 10) / 10, whiteSpace: 'nowrap' }}
        >
          {glyph.char}
        </div>
      ))}
    </div>
  )
}