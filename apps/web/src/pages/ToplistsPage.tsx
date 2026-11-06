import { FormControl, InputLabel, MenuItem, Select, Tab, Tabs, type TabsActions } from '@mui/material'
import { useNavigate, useSearch } from '@tanstack/react-router'
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
  difficultyTextStyle,
} from '@/components/scores/ScorePage'
import { SheetListItem } from '@/components/sheet/SheetListItem'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
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
import { DIFFICULTIES } from '@/models/difficulties'
import { useUserRecords } from '@/models/useUserRecords'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { type FlattenedSheet, useSheets } from '@/songs'
import { difficultyInkClassName } from '@/utils/difficultyInk'

const COMBO_LABELS: Record<string, string> = { fc: 'FC', fcp: 'FC+', ap: 'AP', app: 'AP+' }
const SYNC_LABELS: Record<string, string> = { sync: 'SYNC', fs: 'FS', fsp: 'FS+', fsd: 'FDX', fsdp: 'FDX+' }

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
    <ScorePageFrame>
      {header}

      <MaterialSurface variant="thin" className="overflow-hidden">
        <Tabs
          action={tabsActions}
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
      </MaterialSurface>

      <MaterialSurface className="flex flex-wrap items-center gap-3 p-3">
        <FormControl size="small" className="min-w-36">
          <InputLabel id="toplist-sort">{t('toplists:sort.label')}</InputLabel>
          <Select
            labelId="toplist-sort"
            label={t('toplists:sort.label')}
            value={sort}
            onChange={(event) =>
              void navigate({ search: (prev) => ({ ...prev, sort: event.target.value as ToplistSort }), replace: true })
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
        <div className="flex-1" />
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
        <MaterialSurface as="ol" className="list-none m-0 p-1 flex flex-col">
          {rows.map((row, index) => {
            const sheet = flattenedById.get(row.sheet.id)
            return sheet ? <ToplistItem key={row.sheet.id} row={row} sheet={sheet} position={index + 1} /> : null
          })}
        </MaterialSurface>
      )}
    </ScorePageFrame>
  )
}

const ToplistItem: FC<{ row: ToplistRow; sheet: FlattenedSheet; position: number }> = ({ row, sheet, position }) => {
  const { t, i18n } = useTranslation(['toplists'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const difficulty = DIFFICULTIES[sheet.difficulty as keyof typeof DIFFICULTIES]
  const flags = [
    row.entry.comboFlag && COMBO_LABELS[row.entry.comboFlag],
    row.entry.syncFlag && SYNC_LABELS[row.entry.syncFlag],
  ].filter(Boolean)

  return (
    <li className="list-none">
      <SheetListItem
        sheet={sheet}
        className="rounded-lg"
        analytics={{ source: 'toplist', position }}
        SheetDialogContentProps={{ currentAchievementRate: row.entry.achievementRate }}
      >
        <div className="flex items-center gap-3 w-full min-w-0 py-1">
          <span className="w-7 shrink-0 text-right text-xs text-fg-2 num">{position}</span>
          <img
            src={`https://shama.dxrating.net/images/cover/v2/${sheet.imageName}.jpg`}
            alt=""
            loading="lazy"
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-[var(--radius-md)] outline outline-1 outline-black/10 -outline-offset-1"
          />
          <span className="flex flex-col min-w-0 flex-1">
            <span lang="ja" className="truncate font-semibold text-sm text-fg-1">
              {sheet.title}
            </span>
            <span className="text-xs flex flex-wrap gap-x-2 gap-y-0 text-fg-2">
              <span
                className={`whitespace-nowrap font-semibold ${difficultyInkClassName}`}
                style={difficultyTextStyle(sheet.difficulty)}
              >
                {difficulty?.title ?? sheet.difficulty}
              </span>
              <span className="whitespace-nowrap">{getSheetTypeDisplayName(sheet.type, locale)}</span>
              <span className="whitespace-nowrap num">{sheet.internalLevelValue.toFixed(1)}</span>
              {flags.length > 0 && (
                <span className="whitespace-nowrap font-semibold text-fg-1">{flags.join(' / ')}</span>
              )}
            </span>
          </span>
          <span className="flex flex-col items-end shrink-0 num">
            <span className="font-semibold text-sm text-fg-1">{row.entry.achievementRate.toFixed(4)}%</span>
            <span className="text-xs text-fg-2 whitespace-nowrap">
              {row.dxScore !== null && row.dxScoreMax
                ? `${row.dxScore} / ${row.dxScoreMax} ${'✦'.repeat(row.dxStars)}`
                : row.rating !== null
                  ? t('toplists:rating-value', { rating: row.rating })
                  : ''}
            </span>
          </span>
        </div>
      </SheetListItem>
    </li>
  )
}