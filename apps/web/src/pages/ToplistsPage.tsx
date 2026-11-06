import { FormControl, InputLabel, MenuItem, Select, Tab, Tabs, type TabsActions } from '@mui/material'
import { useNavigate, useSearch } from '@tanstack/react-router'
import clsx from 'clsx'
import { type FC, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { ShareImageButton } from '@/components/global/ShareImageButton'
import {
  DemoScoresNotice,
  ImportScoresLink,
  NoScoresState,
  ScorePageFrame,
  ScorePageHeader,
} from '@/components/scores/ScorePage'
import { DifficultyLevelBadge, LampBadges, RankBadge, SheetTypeBadge } from '@/components/scores/ScoreBadges'
import { SheetListItem } from '@/components/sheet/SheetListItem'
import {
  buildToplist,
  defaultSortOf,
  levelsOf,
  TOPLIST_KINDS,
  TOPLIST_SORTS,
  type ToplistRow,
  type ToplistSort,
  toToplistRow,
} from '@/components/toplists/toplistData'
import { drawToplistShareImage } from '@/components/toplists/toplistShareImage'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useUserRecords } from '@/models/useUserRecords'
import { type FlattenedSheet, useSheets } from '@/songs'

export const ToplistsPage: FC = () => {
  const { t } = useTranslation(['toplists'])
  const search = useSearch({ from: '/me/records' })
  const navigate = useNavigate({ from: '/me/records' })
  const kind = search.tab ?? 'ap'
  const sort = search.sort ?? defaultSortOf(kind)
  const level = search.level

  const { records, isDemo } = useUserRecords()
  const { data: sheets } = useSheets()
  const flattenedById = useMemo(() => new Map(sheets?.map((sheet) => [sheet.id, sheet]) ?? []), [sheets])

  const allRows = useMemo(() => records.flatMap((record) => toToplistRow(record) ?? []), [records])
  const levels = useMemo(() => levelsOf(allRows), [allRows])
  const rows = useMemo(() => buildToplist(allRows, { kind, sort, level }), [allRows, kind, sort, level])
  const showDxScore = useMemo(() => kind === 'dx_score' || rows.some((row) => row.dxScore !== null), [kind, rows])

  // One view event per tab, once the records are resolved
  const reportedKind = useRef<string | null>(null)
  useEffect(() => {
    if (!sheets || reportedKind.current === kind) return
    reportedKind.current = kind
    captureAnalyticsEvent('toplist_viewed', { kind, count: rows.length })
  }, [kind, rows.length, sheets])

  const tabLabel = t(`toplists:tabs.${kind}`)

  // Tab widths change once Torus loads: re-measure so a deep-linked tab scrolls fully into view
  const tabsActions = useRef<TabsActions>(null)
  useEffect(() => {
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (cancelled) return
      tabsActions.current?.updateIndicator()
      tabsActions.current?.updateScrollButtons()
    })
    return () => {
      cancelled = true
    }
  }, [])

  const header = (
    <ScorePageHeader title={t('toplists:title')} description={t('toplists:description')}>
      {isDemo && <DemoScoresNotice className="mt-3">{t('toplists:demo')}</DemoScoresNotice>}
    </ScorePageHeader>
  )

  // Nothing imported yet: no tabs, filters or share to act on, only the way to get scores in
  if (sheets && records.length === 0) {
    return (
      <ScorePageFrame>
        {header}
        <NoScoresState
          title={t('toplists:empty.title')}
          description={t('toplists:empty.no-scores')}
          action={<ImportScoresLink>{t('toplists:empty.import')}</ImportScoresLink>}
        />
      </ScorePageFrame>
    )
  }

  return (
    <ScorePageFrame width="wide">
      {header}

      {/* Tabs and filters share one bar; side by side on desktop, stacked on phones */}
      <MaterialSurface className="flex flex-col lg:flex-row lg:items-center overflow-hidden">
        <Tabs
          action={tabsActions}
          className="min-w-0 lg:flex-1"
          value={kind}
          onChange={(_, value) => void navigate({ search: { tab: value, level }, replace: true })}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label={t('toplists:title')}
          sx={{ '& .MuiTabs-scrollButtons.Mui-disabled': { width: 0, opacity: 0 } }}
        >
          {TOPLIST_KINDS.map((item) => (
            <Tab key={item} value={item} label={t(`toplists:tabs.${item}`)} className="min-w-0 px-3" />
          ))}
        </Tabs>

        <div
          className={clsx(
            'flex flex-wrap items-center gap-3 p-3 lg:py-2 lg:shrink-0',
            'border-solid border-black/8 border-x-0 border-b-0 border-t lg:border-t-0 lg:border-l',
          )}
        >
          <FormControl size="small" className="min-w-36">
            <InputLabel id="toplist-sort">{t('toplists:sort.label')}</InputLabel>
            <Select
              labelId="toplist-sort"
              label={t('toplists:sort.label')}
              value={sort}
              onChange={(event) =>
                void navigate({
                  search: (prev) => ({ ...prev, sort: event.target.value as ToplistSort }),
                  replace: true,
                })
              }
            >
              {TOPLIST_SORTS.map((item) => (
                <MenuItem key={item} value={item}>
                  {t(`toplists:sort.${item}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" className="min-w-28">
            <InputLabel id="toplist-level">{t('toplists:level.label')}</InputLabel>
            <Select
              labelId="toplist-level"
              label={t('toplists:level.label')}
              value={level ?? ''}
              onChange={(event) =>
                void navigate({
                  search: (prev) => ({ ...prev, level: event.target.value || undefined }),
                  replace: true,
                })
              }
            >
              <MenuItem value="">{t('toplists:level.all')}</MenuItem>
              {levels.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <output className="text-sm text-fg-2 num">{t('toplists:count', { count: rows.length })}</output>
          <div className="flex-1 lg:hidden" />
          <ShareImageButton
            size="small"
            disabled={rows.length === 0}
            filename={`dxrating-${kind}.png`}
            shareTitle={tabLabel}
            getImage={() =>
              drawToplistShareImage(rows, {
                title: tabLabel,
                subtitle: [level, t(`toplists:sort.${sort}`)].filter(Boolean).join(' · '),
              })
            }
            onExported={(outcome) => captureAnalyticsEvent('toplist_share_exported', { kind, outcome })}
          />
        </div>
      </MaterialSurface>

      {!sheets ? null : rows.length === 0 ? (
        kind === 'dx_score' ? (
          <NoScoresState
            title={t('toplists:empty.dx_score-title')}
            description={t('toplists:empty.dx_score')}
            action={<ImportScoresLink>{t('toplists:empty.import')}</ImportScoresLink>}
          />
        ) : (
          <MaterialSurface className="p-4 text-sm text-fg-2">{t('toplists:empty.default')}</MaterialSurface>
        )
      ) : (
        <MaterialSurface className="p-1">
          <ToplistColumnHeader showDxScore={showDxScore} />
          <ol className="list-none m-0 p-0 flex flex-col">
            {rows.map((row, index) => {
              const sheet = flattenedById.get(row.sheet.id)
              return sheet ? (
                <ToplistItem
                  key={row.sheet.id}
                  row={row}
                  sheet={sheet}
                  position={index + 1}
                  showDxScore={showDxScore}
                />
              ) : null
            })}
          </ol>
        </MaterialSurface>
      )}
    </ScorePageFrame>
  )
}

/**
 * Desktop columns: position, jacket, title, chart, achievement, rank, lamps, (DX score), rating. The header and every
 * row share one template so the columns line up; the DX score column only appears when some row has one.
 */
const DESKTOP_GRID =
  'lg:grid lg:items-center lg:gap-x-4 lg:grid-cols-[2rem_2.5rem_minmax(0,1fr)_10.5rem_6.5rem_3.5rem_6.5rem_3.5rem]'
const DESKTOP_GRID_WITH_DX =
  'lg:grid lg:items-center lg:gap-x-4 lg:grid-cols-[2rem_2.5rem_minmax(0,1fr)_10.5rem_6.5rem_3.5rem_6.5rem_8rem_3.5rem]'

const ToplistColumnHeader: FC<{ showDxScore: boolean }> = ({ showDxScore }) => {
  const { t } = useTranslation(['toplists'])
  return (
    <div
      aria-hidden
      className={clsx(
        'hidden px-4 pt-2 pb-1.5 text-xs font-semibold text-fg-2 border-b border-solid border-black/8 border-x-0 border-t-0',
        showDxScore ? DESKTOP_GRID_WITH_DX : DESKTOP_GRID,
      )}
    >
      <span className="text-right">#</span>
      <span />
      <span>{t('toplists:columns.song')}</span>
      <span>{t('toplists:columns.chart')}</span>
      <span className="text-right">{t('toplists:columns.achievement')}</span>
      <span>{t('toplists:columns.rank')}</span>
      <span>{t('toplists:columns.lamps')}</span>
      {showDxScore && <span className="text-right">{t('toplists:columns.dx_score')}</span>}
      <span className="text-right">{t('toplists:columns.rating')}</span>
    </div>
  )
}

/** `compact` drops the maximum, for the narrow phone row */
const DxScoreText: FC<{ row: ToplistRow; compact?: boolean }> = ({ row, compact = false }) =>
  row.dxScore !== null && row.dxScoreMax ? (
    <>
      {compact ? row.dxScore : `${row.dxScore} / ${row.dxScoreMax}`}
      {row.dxStars > 0 && (
        <span className="ml-1 text-[#8A5A00] dark:text-[#F2C94C]">
          <span aria-hidden>{'✦'.repeat(row.dxStars)}</span>
          <span className="sr-only">{`${row.dxStars}★`}</span>
        </span>
      )}
    </>
  ) : (
    <span aria-hidden>–</span>
  )

const ToplistItem: FC<{ row: ToplistRow; sheet: FlattenedSheet; position: number; showDxScore: boolean }> = ({
  row,
  sheet,
  position,
  showDxScore,
}) => {
  const { t } = useTranslation(['toplists'])
  const cover = `https://shama.dxrating.net/images/cover/v2/${sheet.imageName}.jpg`
  const level = sheet.internalLevelValue.toFixed(1)
  const achievement = `${row.entry.achievementRate.toFixed(4)}%`
  const chart = (
    <span className="flex flex-wrap items-center gap-1">
      <DifficultyLevelBadge difficulty={sheet.difficulty} level={level} />
      <SheetTypeBadge type={sheet.type} />
    </span>
  )

  return (
    <li className="list-none">
      <SheetListItem
        sheet={sheet}
        className="rounded-lg !py-1.5 lg:!py-1"
        analytics={{ source: 'toplist', position }}
        SheetDialogContentProps={{ currentAchievementRate: row.entry.achievementRate }}
      >
        {/* Phones and tablets: the iOS score row. Title, chart and lamps on the left; achievement, rank and rating on
            the right */}
        <div className="flex items-center gap-2.5 w-full min-w-0 py-1 lg:hidden">
          <span className="w-5 shrink-0 text-right text-xs text-fg-2 num">{position}</span>
          <img
            src={cover}
            alt=""
            loading="lazy"
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-[var(--radius-md)] outline outline-1 outline-black/10 -outline-offset-1"
          />
          <span className="flex flex-col gap-1 min-w-0 flex-1">
            <span lang="ja" className="truncate font-semibold text-sm leading-tight text-fg-1">
              {sheet.title}
            </span>
            {chart}
            <LampBadges comboFlag={row.entry.comboFlag} syncFlag={row.entry.syncFlag} />
          </span>
          <span className="flex flex-col items-end gap-1 shrink-0 num">
            <span className="font-semibold text-sm leading-tight text-fg-1">{achievement}</span>
            <RankBadge achievementRate={row.entry.achievementRate} />
            <span className="text-xs leading-tight text-fg-2 whitespace-nowrap">
              {row.dxScore !== null && row.dxScoreMax ? (
                <DxScoreText row={row} compact />
              ) : row.rating !== null ? (
                t('toplists:rating-value', { rating: row.rating })
              ) : null}
            </span>
          </span>
        </div>

        {/* Desktop: one aligned table row */}
        <div
          className={clsx(
            'hidden w-full min-w-0 py-0.5 text-sm num',
            showDxScore ? DESKTOP_GRID_WITH_DX : DESKTOP_GRID,
          )}
        >
          <span className="text-right text-xs text-fg-2">{position}</span>
          <img
            src={cover}
            alt=""
            loading="lazy"
            width={40}
            height={40}
            className="size-10 rounded-[var(--radius-sm)] outline outline-1 outline-black/10 -outline-offset-1"
          />
          <span className="flex flex-col min-w-0">
            <span lang="ja" className="truncate font-semibold leading-tight text-fg-1" title={sheet.title}>
              {sheet.title}
            </span>
            <span lang="ja" className="truncate text-xs leading-tight text-fg-2">
              {sheet.artist}
            </span>
          </span>
          {chart}
          <span className="text-right font-semibold text-fg-1">{achievement}</span>
          <span>
            <RankBadge achievementRate={row.entry.achievementRate} />
          </span>
          <span>
            <LampBadges comboFlag={row.entry.comboFlag} syncFlag={row.entry.syncFlag} />
          </span>
          {showDxScore && (
            <span className="text-right text-xs text-fg-2 whitespace-nowrap">
              <span className="sr-only">{t('toplists:columns.dx_score')} </span>
              <DxScoreText row={row} />
            </span>
          )}
          <span className="text-right font-semibold text-fg-1">
            <span className="sr-only">{t('toplists:columns.rating')} </span>
            {row.rating ?? <span aria-hidden>–</span>}
          </span>
        </div>
      </SheetListItem>
    </li>
  )
}