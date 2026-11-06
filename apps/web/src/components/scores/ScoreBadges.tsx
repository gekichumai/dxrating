import type { ComboFlag, SyncFlag } from '@gekichumai/maimai-domain'
import { TypeEnum } from '@gekichumai/dxdata'
import clsx from 'clsx'
import type { CSSProperties, FC } from 'react'
import { useTranslation } from 'react-i18next'
import { achievementRankLabel, COMBO_LABELS, SYNC_LABELS } from '@/components/completion/completion'
import { getSheetTypeAltTextKey } from '@/components/sheet/sheetTypeAssets'
import { DIFFICULTIES } from '@/models/difficulties'

/**
 * Score badges shared with the iOS app (DesignSystem/DXBadges.swift and ChartIndicators.swift): the same words and
 * fills, so a lamp, rank or chart type reads the same on both. Every solid fill carries its label at 4.5:1 or more, and
 * the fills are the same in light and dark themes, like the game's own plates.
 */

const BADGE =
  'inline-flex h-[18px] shrink-0 items-center rounded-[var(--radius-sm)] px-1.5 text-[11px] leading-none font-extrabold tracking-[0.02em] whitespace-nowrap num'

const COMBO_FILLS: Record<NonNullable<ComboFlag>, string> = {
  fc: '#15803D',
  fcp: '#15803D',
  ap: '#A16207',
  app: '#A16207',
}
const SYNC_FILLS: Record<NonNullable<SyncFlag>, string> = {
  sync: '#4B5563',
  fs: '#1D4ED8',
  fsp: '#1D4ED8',
  fsd: '#B45309',
  fsdp: '#B45309',
}

/** A combo lamp (FC, FC+, AP, AP+) and a sync lamp (SYNC, FS, FS+, FDX, FDX+), each labelled */
export const LampBadges: FC<{ comboFlag?: ComboFlag | null; syncFlag?: SyncFlag | null; className?: string }> = ({
  comboFlag,
  syncFlag,
  className,
}) => {
  if (!comboFlag && !syncFlag) return null
  return (
    <span className={clsx('inline-flex items-center gap-1', className)}>
      {comboFlag && (
        <span className={clsx(BADGE, 'text-white')} style={{ backgroundColor: COMBO_FILLS[comboFlag] }}>
          {COMBO_LABELS[comboFlag]}
        </span>
      )}
      {syncFlag && (
        <span className={clsx(BADGE, 'text-white')} style={{ backgroundColor: SYNC_FILLS[syncFlag] }}>
          {SYNC_LABELS[syncFlag]}
        </span>
      )}
    </span>
  )
}

const rankColors = (rank: string): { fill: string; ink: string } => {
  if (rank === 'SSS' || rank === 'SSS+') return { fill: '#B7791F', ink: '#1C1300' }
  if (rank.startsWith('S')) return { fill: '#B45309', ink: '#FFFFFF' }
  return { fill: '#6B7280', ink: '#FFFFFF' }
}

/** The achievement rank (SSS+, SS, AAA…): gold for SSS and up, amber for S to SS+, grey below */
export const RankBadge: FC<{ achievementRate: number; className?: string }> = ({ achievementRate, className }) => {
  const rank = achievementRankLabel(achievementRate)
  const { fill, ink } = rankColors(rank)
  return (
    <span className={clsx(BADGE, className)} style={{ backgroundColor: fill, color: ink }}>
      {rank}
    </span>
  )
}

/**
 * DX or STD. DX follows the official でらっくす plate: white with the blue outline and multicoloured lettering, each
 * stop deepened to 4.5:1 on white (the plate's yellow cannot reach it and is skipped). STD is the plate's solid blue.
 */
const DX_LETTERING: CSSProperties = {
  backgroundImage: 'linear-gradient(90deg, #D32F2F, #B35600, #3E7D1C, #0277A8)',
  WebkitBackgroundClip: 'text',
}

export const SheetTypeBadge: FC<{ type: TypeEnum; className?: string }> = ({ type, className }) => {
  const { t } = useTranslation(['sheet'])
  const label = t(getSheetTypeAltTextKey(type))
  if (type === TypeEnum.DX) {
    return (
      <span
        className={clsx(BADGE, 'bg-[#fff] border-[1.5px] border-solid border-[#007CDB] px-[5px]', className)}
        title={label}
      >
        <span aria-hidden className="bg-clip-text text-transparent" style={DX_LETTERING}>
          DX
        </span>
        <span className="sr-only">{label}</span>
      </span>
    )
  }
  return (
    <span
      className={clsx(BADGE, type === TypeEnum.STD ? 'bg-[#1D6FD8] text-white' : 'bg-[#6B21A8] text-white', className)}
      title={label}
    >
      <span aria-hidden>{type === TypeEnum.STD ? 'STD' : type === TypeEnum.UTAGE2P ? '宴 2P' : '宴'}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * The difficulty name on its solid colour, followed by the internal level on a tint of the same colour, like the iOS
 * app's two-tone difficulty pill
 */
export const DifficultyLevelBadge: FC<{ difficulty: string; level: string; className?: string }> = ({
  difficulty,
  level,
  className,
}) => {
  const entry = DIFFICULTIES[difficulty as keyof typeof DIFFICULTIES]
  const solid = entry?.solid ?? '#6B7280'
  return (
    <span
      className={clsx(
        'inline-flex h-[18px] shrink-0 items-stretch overflow-hidden rounded-[var(--radius-sm)] border border-solid text-[11px] leading-none font-extrabold whitespace-nowrap',
        'border-[var(--difficulty-solid)]',
        className,
      )}
      style={{ '--difficulty-solid': solid } as CSSProperties}
    >
      <span className="flex items-center bg-[var(--difficulty-solid)] px-1.5 tracking-[0.02em] text-white">
        {entry?.title ?? difficulty}
      </span>
      <span className="flex items-center px-1.5 text-fg-1 num bg-[color-mix(in_oklab,var(--difficulty-solid)_14%,transparent)] dark:bg-[color-mix(in_oklab,var(--difficulty-solid)_30%,transparent)]">
        {level}
      </span>
    </span>
  )
}