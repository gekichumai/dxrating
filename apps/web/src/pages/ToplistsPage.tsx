import { coverUrl } from '@gekichumai/dxdata'
import { FormControl, InputLabel, MenuItem, Select, Tab, Tabs, type TabsActions } from '@mui/material'
import { useNavigate, useSearch } from '@tanstack/react-router'
import clsx from 'clsx'
import { type FC, useEffect, useMemo, useRef } from 'react'
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
import { shareLink } from '@/utils/shareImage/shareFooter'
import { captureAnalyticsEvent, type ToplistKind } from '@/lib/analytics'
import { DxScoreProgressText } from '@/components/scores/DxScoreProgressText'
import { useUserRecords } from '@/models/useUserRecords'
import { type FlattenedSheet, useSheets } from '@/songs'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

const TAB_LABELS = {
  ap: m.toplists_tabs_ap,
  app: m.toplists_tabs_app,
  fc: m.toplists_tabs_fc,
  fcp: m.toplists_tabs_fcp,
  fdx: m.toplists_tabs_fdx,
  fdxp: m.toplists_tabs_fdxp,
  dx_score: m.toplists_tabs_dx_score,
  highest: m.toplists_tabs_highest,
} satisfies Record<ToplistKind, PlainMessage>

const SORT_LABELS = {
  achievement: m.toplists_sort_achievement,
  rating: m.toplists_sort_rating,
  level: m.toplists_sort_level,
  dx_score: m.toplists_sort_dx_score,
} satisfies Record<ToplistSort, PlainMessage>

export const ToplistsPage: FC = () => {
  const locale = useLocale()
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

  const tabLabel = TAB_LABELS[kind]({}, { locale })

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
    <ScorePageHeader title={m.toplists_title({}, { locale })} description={m.toplists_description({}, { locale })}>
      {isDemo && <DemoScoresNotice className="mt-3">{m.toplists_demo({}, { locale })}</DemoScoresNotice>}
    </ScorePageHeader>
  )

  // Nothing imported yet: no tabs, filters or share to act on, only the way to get scores in
  if (sheets && records.length === 0) {
    return (
      <ScorePageFrame width="me">
        {header}
        <NoScoresState
          title={m.toplists_empty_title({}, { locale })}
          description={m.toplists_empty_noScores({}, { locale })}
          action={<ImportScoresLink>{m.toplists_empty_import({}, { locale })}</ImportScoresLink>}
        />
      </ScorePageFrame>
    )
  }

  return (
    <ScorePageFrame width="me">
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
          classes={{ scroller: 'scroll-fade-x' }}
          aria-label={m.toplists_title({}, { locale })}
          sx={{ '& .MuiTabs-scrollButtons.Mui-disabled': { width: 0, opacity: 0 } }}
        >
          {TOPLIST_KINDS.map((item) => (
            <Tab key={item} value={item} label={TAB_LABELS[item]({}, { locale })} className="min-w-0 px-3" />
          ))}
        </Tabs>

        <div
          className={clsx(
            'flex flex-wrap items-center gap-3 p-3 lg:py-2 lg:shrink-0',
            'border-solid border-black/8 border-x-0 border-b-0 border-t lg:border-t-0 lg:border-l',
          )}
        >
          <FormControl size="small" className="min-w-36">
            <InputLabel id="toplist-sort">{m.toplists_sort_label({}, { locale })}</InputLabel>
            <Select
              labelId="toplist-sort"
              label={m.toplists_sort_label({}, { locale })}
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
                  {SORT_LABELS[item]({}, { locale })}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" className="min-w-28">
            <InputLabel id="toplist-level">{m.toplists_level_label({}, { locale })}</InputLabel>
            <Select
              labelId="toplist-level"
              label={m.toplists_level_label({}, { locale })}
              value={level ?? ''}
              onChange={(event) =>
                void navigate({
                  search: (prev) => ({ ...prev, level: event.target.value || undefined }),
                  replace: true,
                })
              }
            >
              <MenuItem value="">{m.toplists_level_all({}, { locale })}</MenuItem>
              {levels.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <output className="text-sm text-fg-2 num">{m.toplists_count({ count: rows.length }, { locale })}</output>
          <div className="flex-1 lg:hidden" />
          <ShareImageButton
            size="small"
            // Same 40px height as the small selects beside it, so the outlines line up
            sx={{ minHeight: 40 }}
            disabled={rows.length === 0}
            filename={`dxrating-${kind}.png`}
            shareTitle={tabLabel}
            getImage={() =>
              drawToplistShareImage(rows, {
                title: tabLabel,
                subtitle: [level, SORT_LABELS[sort]({}, { locale })].filter(Boolean).join(' · '),
                // The page shows the scanner's own records, in the same list
                link: shareLink('/me/records', { tab: search.tab, sort: search.sort, level }),
                footerCaption: m.share_image_footerCaption({}, { locale }),
              })
            }
            onExported={(outcome) => captureAnalyticsEvent('toplist_share_exported', { kind, outcome })}
          />
        </div>
      </MaterialSurface>

      {!sheets ? null : rows.length === 0 ? (
        kind === 'dx_score' ? (
          <NoScoresState
            title={m.toplists_empty_dx_scoreTitle({}, { locale })}
            description={m.toplists_empty_dx_score({}, { locale })}
            action={<ImportScoresLink>{m.toplists_empty_import({}, { locale })}</ImportScoresLink>}
          />
        ) : (
          <MaterialSurface className="p-4 text-sm text-fg-2">
            {m.toplists_empty_default({}, { locale })}
          </MaterialSurface>
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
  const locale = useLocale()
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
      <span>{m.toplists_columns_song({}, { locale })}</span>
      <span>{m.toplists_columns_chart({}, { locale })}</span>
      <span className="text-right">{m.toplists_columns_achievement({}, { locale })}</span>
      <span>{m.toplists_columns_rank({}, { locale })}</span>
      <span>{m.toplists_columns_lamps({}, { locale })}</span>
      {showDxScore && <span className="text-right">{m.toplists_columns_dx_score({}, { locale })}</span>}
      <span className="text-right">{m.toplists_columns_rating({}, { locale })}</span>
    </div>
  )
}

/** `compact` is the phone row: the share of the maximum and the stars, without the raw score */
const DxScoreText: FC<{ row: ToplistRow; compact?: boolean }> = ({ row, compact = false }) =>
  row.dxScore !== null && row.dxScoreMax ? (
    <DxScoreProgressText
      dxScore={row.dxScore}
      max={row.dxScoreMax}
      layout={compact ? 'compact' : 'stacked'}
      align="end"
    />
  ) : (
    <span aria-hidden>–</span>
  )

const ToplistItem: FC<{ row: ToplistRow; sheet: FlattenedSheet; position: number; showDxScore: boolean }> = ({
  row,
  sheet,
  position,
  showDxScore,
}) => {
  const locale = useLocale()
  const cover = coverUrl(sheet.songId)
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
        className="rounded-lg !py-1.5 lg:!py-1 max-2xs:!px-3"
        analytics={{ source: 'toplist', position }}
        SheetDialogContentProps={{ currentAchievementRate: row.entry.achievementRate }}
      >
        {/* Phones and tablets: the iOS score row. Title, chart and lamps on the left; achievement, rank and rating on
            the right. Below 375px the position goes and the jacket shrinks, so a Re:MASTER pill still clears the
            achievement at 320px */}
        <div className="flex items-center gap-2.5 w-full min-w-0 py-1 lg:hidden">
          <span className="hidden 2xs:block w-5 shrink-0 text-right text-xs text-fg-2 num">{position}</span>
          <img
            src={cover}
            alt=""
            loading="lazy"
            width={44}
            height={44}
            className="size-10 2xs:size-11 shrink-0 rounded-[var(--radius-md)] outline outline-1 outline-black/10 -outline-offset-1"
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
                m.toplists_ratingValue({ rating: row.rating }, { locale })
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
              <span className="sr-only">{m.toplists_columns_dx_score({}, { locale })} </span>
              <DxScoreText row={row} />
            </span>
          )}
          <span className="text-right font-semibold text-fg-1">
            <span className="sr-only">{m.toplists_columns_rating({}, { locale })} </span>
            {row.rating ?? <span aria-hidden>–</span>}
          </span>
        </div>
      </SheetListItem>
    </li>
  )
}