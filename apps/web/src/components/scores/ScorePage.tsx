import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import type { CSSProperties, FC, ReactNode } from 'react'
import MdiAlertOutline from '~icons/mdi/alert-outline'
import { DIFFICULTIES } from '@/models/difficulties'

/**
 * Shared frame for the score-derived pages (top records, level progress, rating boosts, random chart), so they line
 * up at the same width, gutter and heading position, and show empty and demo states the same way.
 */
export const ScorePageFrame: FC<{ width?: '3xl' | '5xl'; children: ReactNode }> = ({ width = '3xl', children }) => (
  <div
    className={clsx(
      'mx-auto w-full flex flex-col gap-4 pt-2 pb-global',
      'pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)]',
      width === '5xl' ? 'max-w-5xl' : 'max-w-3xl',
    )}
  >
    {children}
  </div>
)

export const ScorePageHeader: FC<{ title: ReactNode; description?: ReactNode; children?: ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <header className="flex flex-col gap-1">
    <h1 className="page-title m-0">{title}</h1>
    {description && <p className="page-description m-0">{description}</p>}
    {children}
  </header>
)

/** Shown while the page runs on demo scores: warning-tinted glass, the same on every page */
export const DemoScoresNotice: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <p
    className={clsx(
      'glass-thin m-0 flex items-start gap-2 px-3 py-2 text-sm leading-normal text-fg-1 text-pretty',
      'bg-[color-mix(in_oklab,var(--status-warning)_10%,var(--glass-thin-bg))]',
      'border-[color-mix(in_oklab,var(--status-warning)_28%,transparent)]',
      className,
    )}
  >
    <MdiAlertOutline aria-hidden className="mt-0.5 size-4 shrink-0 text-status-warning" />
    <span>{children}</span>
  </p>
)

/** No scores to derive anything from: what is missing, and the one way to fix it */
export const NoScoresState: FC<{
  title: ReactNode
  description: ReactNode
  action?: ReactNode
  className?: string
}> = ({ title, description, action, className }) => (
  <section className={clsx('glass flex flex-col items-start gap-1 p-4 text-start', className)}>
    <h2 className="section-title m-0">{title}</h2>
    <p className="m-0 text-sm leading-normal text-fg-2 text-pretty max-w-[60ch]">{description}</p>
    {action && <div className="mt-2 text-sm">{action}</div>}
  </section>
)

/** The one way into the importer from an empty state */
export const ImportScoresLink: FC<{ children: ReactNode }> = ({ children }) => (
  <Link to="/rating" className="link font-semibold">
    {children}
  </Link>
)

/**
 * Difficulty-coloured text at 4.5:1: the darkened `ink` on light glass and `inkDark` in the dark theme, switched by
 * CSS variables. Pair with `difficultyInkClassName`.
 */
export const difficultyTextStyle = (difficulty: string | undefined): CSSProperties => {
  const entry = difficulty ? DIFFICULTIES[difficulty as keyof typeof DIFFICULTIES] : undefined
  return { '--difficulty-ink': entry?.ink, '--difficulty-ink-dark': entry?.inkDark } as CSSProperties
}