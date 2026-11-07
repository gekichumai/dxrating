/**
 * Shared chrome of the data-table pages (constants, versions, plates): breadcrumb, segmented navigation, toggle
 * chips and the horizontal scroller's overflow state. One selected treatment everywhere: the accent fill.
 */
import { DifficultyEnum } from '@gekichumai/dxdata'
import { type CSSProperties, type FC, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DIFFICULTIES } from '@/models/difficulties'
import { difficultyInkClassName } from '@/utils/difficultyInk'
import { InternalLink } from '@/components/global/InternalLink'

/** Short difficulty names shown next to levels, so a level never depends on its colour alone */
export const DIFFICULTY_SHORT: Record<DifficultyEnum, string> = Object.fromEntries(
  Object.entries(DIFFICULTIES).map(([difficulty, entry]) => [difficulty, entry.shortTitle]),
) as Record<DifficultyEnum, string>

/**
 * Difficulty-coloured text that passes 4.5:1: `ink` on light glass, `inkDark` in the dark theme, switched through CSS
 * variables (never by reading the theme in render). Add `difficultyTextClassName` to the element.
 */
export const difficultyTextClassName = difficultyInkClassName
export const difficultyTextStyle = (difficulty: DifficultyEnum | string | undefined): CSSProperties => {
  const entry = difficulty ? DIFFICULTIES[difficulty as DifficultyEnum] : undefined
  return { '--difficulty-ink': entry?.ink, '--difficulty-ink-dark': entry?.inkDark } as CSSProperties
}

// The selected state: accent fill with white text (>=4.5:1). Same weight both ways, so toggling never reflows.
const SELECTED = 'bg-accent-strong text-on-accent'

/** A track of 8px items at a 4px inset: 12px outer radius (8 + 4) */
export const segmentedTrack = 'glass-thin flex flex-wrap gap-1 p-1'
export const segmentedItem = (current: boolean) =>
  `inline-flex items-center min-h-8 px-3 rounded-[var(--radius-md)] text-sm no-underline transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] ${
    current ? SELECTED : 'text-fg-1 hover:bg-surface/60'
  }`

export const SegmentedNav: FC<{
  label?: string
  labelledBy?: string
  items: { key: string; href: string; label: ReactNode; current: boolean }[]
  className?: string
}> = ({ label, labelledBy, items, className }) => (
  <nav aria-label={label} aria-labelledby={labelledBy} className={`${segmentedTrack} self-start ${className ?? ''}`}>
    {items.map((item) => (
      <InternalLink
        key={item.key}
        href={item.href}
        aria-current={item.current ? 'page' : undefined}
        className={segmentedItem(item.current)}
      >
        {item.label}
      </InternalLink>
    ))}
  </nav>
)

/** A toggle chip (aria-pressed). `solid` is a difficulty fill that carries white text, used when pressed */
export const FilterChip: FC<{ active: boolean; onClick: () => void; children: ReactNode; solid?: string }> = ({
  active,
  onClick,
  children,
  solid,
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`min-h-8 px-3 rounded-[var(--radius-md)] text-xs cursor-pointer border border-solid transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] ${
      active
        ? `border-transparent ${SELECTED}`
        : 'border-[var(--glass-border)] bg-surface/40 text-fg-1 hover:bg-surface/70'
    }`}
    // Difficulty fills keep their value in both themes, so their label stays white (not the theme's on-accent)
    style={active && solid ? { backgroundColor: solid, color: '#fff' } : undefined}
  >
    {children}
  </button>
)

export const Breadcrumb: FC<{ items: { href?: string; label: ReactNode }[] }> = ({ items }) => {
  const { t } = useTranslation(['constants'])
  return (
    <nav aria-label={t('constants:breadcrumb-label')} className="text-xs text-fg-2">
      <ol className="m-0 p-0 list-none flex flex-wrap items-center gap-x-1">
        <li>
          <InternalLink href="/" className="text-inherit no-underline hover:underline underline-offset-2">
            DXRating
          </InternalLink>
        </li>
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-x-1">
            <span aria-hidden>›</span>
            {item.href ? (
              <InternalLink href={item.href} className="text-inherit no-underline hover:underline underline-offset-2">
                {item.label}
              </InternalLink>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

type Overflow = { start: boolean; end: boolean }

/**
 * Horizontal scroller for a table that may not fit: reports overflow, so key columns can turn sticky. The edge fade
 * itself is the `scroll-fade-x` class (index.css). Server and first client render report no overflow (deterministic SSR).
 */
export const useHorizontalOverflow = <T extends HTMLElement>() => {
  const ref = useRef<T>(null)
  const [overflow, setOverflow] = useState<Overflow>({ start: false, end: false })

  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return
    const max = element.scrollWidth - element.clientWidth
    const next = { start: max > 1 && element.scrollLeft > 1, end: max > 1 && element.scrollLeft < max - 1 }
    setOverflow((previous) => (previous.start === next.start && previous.end === next.end ? previous : next))
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    element.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', measure)
    }
  }, [measure])

  return { ref, overflowing: overflow.start || overflow.end, scrolled: overflow.start }
}