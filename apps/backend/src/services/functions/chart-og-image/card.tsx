import { TypeEnum } from '@gekichumai/dxdata'
import type { CSSProperties, ReactNode } from 'react'
import { getOgLabels, type OgLocale } from './labels'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

/** The fonts the card names; the renderer registers each of these families */
export const OG_FONT = {
  /** Source Han Sans (every CJK region's glyphs, so Simplified Chinese titles render too) */
  text: 'Source Han Sans',
  /** The game's own UI typeface, for the level number and the difficulty names */
  display: 'NewRodinProDB',
} as const

const COVER_SIZE = 440
const COVER_LEFT = 72
const CONTENT_LEFT = COVER_LEFT + COVER_SIZE + 52
const CONTENT_RIGHT = 68
const CONTENT_WIDTH = OG_WIDTH - CONTENT_LEFT - CONTENT_RIGHT
const CONTENT_TOP = 72
const CONTENT_BOTTOM = 92

const TEXT = '#ffffff'
const TEXT_SECONDARY = 'rgba(255, 255, 255, 0.82)'
const TEXT_TERTIARY = 'rgba(255, 255, 255, 0.66)'

export type OgSheetBadge = {
  type: TypeEnum
  difficultyLabel: string
  difficultyColor: string
  difficultyTextColor: string
  level: string
  internalLevelValue: number
}

export type OgCardImages = {
  /** The jacket, or null when the asset server has none */
  cover: string | null
  /** The jacket blurred and darkened, or null without a jacket */
  backdrop: string | null
  logo: string | null
}

export type ChartOgCardProps = {
  title: string
  artist: string
  sheet: OgSheetBadge
  facts: { notes: number | null; bpm: number | null; version: string; designer: string | null }
  locale: OgLocale
  images: OgCardImages
}

export type SongOgCardProps = {
  title: string
  artist: string
  groups: Array<{ type: TypeEnum; sheets: OgSheetBadge[] }>
  facts: { bpm: number | null; version: string; category: string }
  locale: OgLocale
  images: OgCardImages
}

type TypeBadgeDisplay = { label: string; background: string; color: string }

const TYPE_BADGES: Record<TypeEnum, TypeBadgeDisplay> = {
  [TypeEnum.DX]: { label: 'DX', background: 'linear-gradient(135deg, #ff9f1c 0%, #ff4d6d 100%)', color: '#ffffff' },
  [TypeEnum.STD]: { label: 'STD', background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)', color: '#ffffff' },
  [TypeEnum.UTAGE]: { label: '宴', background: 'linear-gradient(135deg, #fb7185 0%, #db2777 100%)', color: '#ffffff' },
  [TypeEnum.UTAGE2P]: {
    label: '宴 BUDDY',
    background: 'linear-gradient(135deg, #fb7185 0%, #db2777 100%)',
    color: '#ffffff',
  },
}

/** "13.4", always with one decimal: the number players compare */
export function formatInternalLevel(internalLevelValue: number) {
  return internalLevelValue.toFixed(1)
}

/**
 * The largest title size whose estimated width fits the column in at most two lines, and how many lines it takes. CJK
 * glyphs are a full em wide, Latin ones about half; anything still longer is cut with an ellipsis at the smallest size.
 */
export function getTitleLayout(title: string, width = CONTENT_WIDTH) {
  const ems = [...title].reduce((sum, char) => sum + estimateCharWidth(char), 0)
  const sizes = [76, 68, 60, 52, 46, 40] as const
  for (const fontSize of sizes) {
    // The two largest sizes are for titles that fit on one line
    const lines = ems * fontSize <= width * 0.94 ? 1 : 2
    if (lines === 2 && fontSize >= 68) continue
    if (ems * fontSize <= width * lines * 0.94) return { fontSize, lines }
  }
  return { fontSize: sizes[sizes.length - 1], lines: 2 }
}

function estimateCharWidth(char: string) {
  const code = char.codePointAt(0) ?? 0
  if (code >= 0x1100 && !(code >= 0xff61 && code <= 0xff9f)) return 1
  if (char === ' ') return 0.26
  if (/[A-Z0-9@#%&MW]/.test(char)) return 0.66
  return 0.54
}

export function ChartOgCard({ title, artist, sheet, facts, locale, images }: ChartOgCardProps) {
  const labels = getOgLabels(locale)
  // A two-line title leaves less height for the level
  const heroSize = getTitleLayout(title).lines === 2 ? 116 : 150
  const factItems: Array<[string, string]> = [
    ...(facts.notes ? [[labels.notes, String(facts.notes)] as [string, string]] : []),
    ...(facts.bpm ? [[labels.bpm, String(facts.bpm)] as [string, string]] : []),
    [labels.version, facts.version],
    ...(facts.designer ? [[labels.designer, facts.designer] as [string, string]] : []),
  ]

  return (
    <CardFrame images={images} accent={sheet.difficultyColor}>
      <Heading title={title} artist={artist} />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DifficultyPill sheet={sheet} size="large" />
          <TypeBadge type={sheet.type} size="large" />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 4 }}>
          <div style={{ ...styles.heroLevel, fontSize: heroSize }}>{formatInternalLevel(sheet.internalLevelValue)}</div>
          <div style={{ ...styles.heroLevelSuffix, marginBottom: Math.round(heroSize * 0.13) }}>Lv {sheet.level}</div>
        </div>
      </div>
      <Facts items={factItems} />
    </CardFrame>
  )
}

export function SongOgCard({ title, artist, groups, facts, locale, images }: SongOgCardProps) {
  const labels = getOgLabels(locale)
  const accent = groups[0]?.sheets.at(-1)?.difficultyColor ?? '#9e45e2'
  const factItems: Array<[string, string]> = [
    ...(facts.bpm ? [[labels.bpm, String(facts.bpm)] as [string, string]] : []),
    [labels.version, facts.version],
    [labels.category, facts.category],
  ]
  const rows = groups.slice(0, 2)
  const perRow = Math.max(4, ...rows.map((group) => Math.min(group.sheets.length, 5)))
  const badgeColumn = rows.some((group) => group.type === TypeEnum.UTAGE2P) ? 132 : 82
  const chipGap = 10
  const chipWidth = Math.floor((CONTENT_WIDTH - badgeColumn - chipGap * perRow) / perRow)

  return (
    <CardFrame images={images} accent={accent}>
      <Heading title={title} artist={artist} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 'auto' }}>
        {rows.map((group) => (
          <div key={group.type} style={{ display: 'flex', alignItems: 'center', gap: chipGap }}>
            <div style={{ display: 'flex', width: badgeColumn, flexShrink: 0 }}>
              <TypeBadge type={group.type} size="small" />
            </div>
            {group.sheets.slice(0, 5).map((sheet) => (
              <LevelChip key={sheet.difficultyLabel} sheet={sheet} width={chipWidth} tall={rows.length === 1} />
            ))}
          </div>
        ))}
      </div>
      <Facts items={factItems} />
    </CardFrame>
  )
}

function CardFrame({ images, accent, children }: { images: OgCardImages; accent: string; children: ReactNode }) {
  return (
    <div style={styles.canvas}>
      {images.backdrop ? (
        <img alt="" src={images.backdrop} width={OG_WIDTH} height={OG_HEIGHT} style={styles.backdrop} />
      ) : (
        <div
          style={{
            ...styles.backdrop,
            backgroundImage: `radial-gradient(circle at 20% 30%, ${accent} 0%, #1e1b4b 55%, #0b1020 100%)`,
          }}
        />
      )}
      {/* Darkens the backdrop more on the text side, so white text stays above 4.5:1 on any jacket */}
      <div style={styles.scrim} />

      <div style={styles.coverFrame}>
        {images.cover ? (
          <img alt="" src={images.cover} width={COVER_SIZE} height={COVER_SIZE} style={styles.cover} />
        ) : (
          <div style={{ ...styles.cover, ...styles.coverPlaceholder }}>
            {images.logo ? (
              <img alt="" src={images.logo} width={180} height={180} style={{ borderRadius: 36 }} />
            ) : null}
          </div>
        )}
      </div>

      <div style={styles.content}>{children}</div>

      <div style={styles.footer}>
        {images.logo ? <img alt="" src={images.logo} width={40} height={40} style={styles.footerLogo} /> : null}
        <span style={styles.footerText}>dxrating.net</span>
      </div>
    </div>
  )
}

function Heading({ title, artist }: { title: string; artist: string }) {
  const { fontSize } = getTitleLayout(title)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...styles.title, fontSize, lineHeight: 1.16, maxHeight: Math.ceil(fontSize * 1.16 * 2) + 4 }}>
        {title}
      </div>
      <div style={styles.artist}>{artist}</div>
    </div>
  )
}

function DifficultyPill({ sheet, size }: { sheet: OgSheetBadge; size: 'large' | 'small' }) {
  return (
    <div
      style={{
        ...styles.pill,
        ...(size === 'large' ? styles.pillLarge : styles.pillSmall),
        backgroundColor: sheet.difficultyColor,
        color: sheet.difficultyTextColor,
      }}
    >
      {sheet.difficultyLabel}
    </div>
  )
}

function TypeBadge({ type, size }: { type: TypeEnum; size: 'large' | 'small' }) {
  const badge = TYPE_BADGES[type]
  return (
    <div
      style={{
        ...styles.pill,
        ...(size === 'large' ? styles.pillLarge : styles.pillSmall),
        backgroundImage: badge.background,
        color: badge.color,
      }}
    >
      {badge.label}
    </div>
  )
}

const CHIP_LABELS: Record<string, string> = {
  BASIC: 'BAS',
  ADVANCED: 'ADV',
  EXPERT: 'EXP',
  MASTER: 'MAS',
  'Re:MASTER': 'Re:MAS',
}

function LevelChip({ sheet, width, tall }: { sheet: OgSheetBadge; width: number; tall: boolean }) {
  // "14.6" is about 2.5 em wide in the display face
  const levelSize = Math.min(tall ? 44 : 40, Math.floor((width - 24) / 2.5))
  return (
    <div style={{ ...styles.chip, width, height: tall ? 100 : 84, borderColor: sheet.difficultyColor }}>
      <div style={{ ...styles.chipBar, backgroundColor: sheet.difficultyColor }} />
      <div style={{ ...styles.chipLabel, fontSize: width < 100 ? 15 : 17 }}>
        {CHIP_LABELS[sheet.difficultyLabel] ?? sheet.difficultyLabel}
      </div>
      <div style={{ ...styles.chipLevel, fontSize: levelSize }}>{formatInternalLevel(sheet.internalLevelValue)}</div>
    </div>
  )
}

function Facts({ items }: { items: Array<[string, string]> }) {
  return (
    <div style={styles.facts}>
      {items.map(([label, value], index) => (
        <div key={label} style={{ ...styles.fact, ...(index === items.length - 1 ? { flexShrink: 1 } : {}) }}>
          <div style={styles.factLabel}>{label}</div>
          <div style={styles.factValue}>{value}</div>
        </div>
      ))}
    </div>
  )
}

const styles = {
  canvas: {
    position: 'relative',
    display: 'flex',
    width: OG_WIDTH,
    height: OG_HEIGHT,
    backgroundColor: '#0b1020',
    color: TEXT,
    fontFamily: OG_FONT.text,
    overflow: 'hidden',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    objectFit: 'cover',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    backgroundImage:
      'linear-gradient(90deg, rgba(8, 10, 24, 0.30) 0%, rgba(8, 10, 24, 0.55) 45%, rgba(8, 10, 24, 0.70) 100%)',
  },
  coverFrame: {
    position: 'absolute',
    left: COVER_LEFT,
    top: (OG_HEIGHT - COVER_SIZE) / 2 - 10,
    display: 'flex',
    width: COVER_SIZE,
    height: COVER_SIZE,
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    objectFit: 'cover',
    borderRadius: 14,
    border: '2px solid rgba(255, 255, 255, 0.22)',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.35), 0 32px 64px rgba(0, 0, 0, 0.35)',
  },
  coverPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  content: {
    position: 'absolute',
    left: CONTENT_LEFT,
    top: CONTENT_TOP,
    width: CONTENT_WIDTH,
    height: OG_HEIGHT - CONTENT_TOP - CONTENT_BOTTOM,
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    display: 'block',
    color: TEXT,
    fontWeight: 700,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    lineClamp: 2,
    textOverflow: 'ellipsis',
  },
  artist: {
    display: 'block',
    marginTop: 10,
    color: TEXT_SECONDARY,
    fontSize: 30,
    fontWeight: 400,
    lineHeight: 1.25,
    maxHeight: 38,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  pill: {
    display: 'flex',
    whiteSpace: 'nowrap',
    alignItems: 'center',
    fontFamily: OG_FONT.display,
    lineHeight: 1,
    borderRadius: 8,
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
  },
  pillLarge: {
    fontSize: 30,
    padding: '9px 18px 10px',
  },
  pillSmall: {
    fontSize: 22,
    padding: '7px 13px 8px',
  },
  heroLevel: {
    fontFamily: OG_FONT.display,
    fontSize: 150,
    lineHeight: 1,
    letterSpacing: -2,
    color: TEXT,
  },
  heroLevelSuffix: {
    whiteSpace: 'nowrap',
    marginLeft: 18,
    marginBottom: 20,
    fontFamily: OG_FONT.display,
    fontSize: 36,
    lineHeight: 1,
    color: TEXT_SECONDARY,
  },
  chip: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    flexShrink: 0,
    padding: '8px 0 0 11px',
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'solid',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  chipBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    height: 6,
  },
  chipLabel: {
    fontFamily: OG_FONT.display,
    color: TEXT_SECONDARY,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  chipLevel: {
    fontFamily: OG_FONT.display,
    color: TEXT,
    lineHeight: 1,
    marginTop: 6,
  },
  facts: {
    display: 'flex',
    gap: 34,
    marginTop: 20,
    paddingTop: 16,
    borderTop: '2px solid rgba(255, 255, 255, 0.18)',
  },
  fact: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    minWidth: 0,
  },
  factLabel: {
    color: TEXT_TERTIARY,
    fontSize: 19,
    fontWeight: 400,
    lineHeight: 1,
  },
  factValue: {
    display: 'block',
    marginTop: 8,
    color: TEXT,
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  footer: {
    position: 'absolute',
    right: CONTENT_RIGHT,
    bottom: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  footerLogo: {
    borderRadius: 9,
  },
  footerText: {
    color: TEXT_SECONDARY,
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1,
  },
} satisfies Record<string, CSSProperties>