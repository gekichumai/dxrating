import { type DxScoreProgress, dxScoreProgress } from '@gekichumai/maimai-domain'
import clsx from 'clsx'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiStarFourPoints from '~icons/mdi/star-four-points'

/** DX score stars as a gold four-point star and a count (the in-game ✦); nothing below ✦1 */
export const DxScoreStarGlyphs: FC<{ stars: number; className?: string }> = ({ stars, className }) => {
  const { t } = useTranslation(['sheet'])
  if (stars <= 0) return null
  return (
    <span
      className={clsx('inline-flex items-center gap-px font-semibold text-[#8A5A00] dark:text-[#F2C94C]', className)}
    >
      <IconMdiStarFourPoints aria-hidden className="size-[0.95em]" />
      <span aria-hidden>{stars}</span>
      <span className="sr-only">{t('sheet:dx-score.stars', { stars })}</span>
    </span>
  )
}

const percentText = (progress: DxScoreProgress) => `${progress.percent.toFixed(2)}%`

/**
 * A DX score as score / max over its share of the maximum and its stars. The distance to the next star is the
 * tooltip and is read out to screen readers. `layout="stacked"` is the two-line table cell; `inline` is one line.
 */
export const DxScoreProgressText: FC<{
  dxScore: number | null | undefined
  max: number | null | undefined
  layout?: 'stacked' | 'inline' | 'compact'
  /** Edge the stacked lines line up on: the start in a left-aligned column, the end in a right-aligned one */
  align?: 'start' | 'end'
  className?: string
}> = ({ dxScore, max, layout = 'stacked', align = 'start', className }) => {
  const { t } = useTranslation(['sheet'])
  const progress = dxScoreProgress(dxScore, max)
  if (!progress) {
    if (dxScore == null) return <span className={clsx('text-fg-2', className)}>–</span>
    return <span className={clsx('num', className)}>{dxScore}</span>
  }
  const next = progress.next
    ? t('sheet:dx-score.to-next-star', { remaining: progress.next.remaining, stars: progress.next.stars })
    : undefined

  if (layout === 'compact') {
    return (
      <span className={clsx('num inline-flex items-center gap-1 whitespace-nowrap', className)} title={next}>
        <span>{percentText(progress)}</span>
        <DxScoreStarGlyphs stars={progress.stars} />
        {next && <span className="sr-only">{next}</span>}
      </span>
    )
  }

  const score = (
    <span className="whitespace-nowrap">
      <span className="text-fg-1">{progress.dxScore}</span>
      <span className="text-xs text-fg-2"> / {progress.max}</span>
    </span>
  )
  const ratio = (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-xs text-fg-2">
      <span>{percentText(progress)}</span>
      <DxScoreStarGlyphs stars={progress.stars} />
    </span>
  )

  return (
    <span
      className={clsx(
        'num',
        layout === 'stacked'
          ? clsx('inline-flex flex-col leading-tight', align === 'end' ? 'items-end' : 'items-start')
          : 'inline-flex items-baseline gap-2',
        className,
      )}
      title={next}
    >
      {score}
      {ratio}
      {next && <span className="sr-only">{next}</span>}
    </span>
  )
}