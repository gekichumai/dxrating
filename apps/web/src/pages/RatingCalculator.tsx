import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  styled,
  useMediaQuery,
} from '@mui/material'
import {
  type Row,
  type SortDirection,
  type SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import clsx from 'clsx'
import { type FC, type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type ItemProps,
  type ScrollerProps,
  type TableBodyProps,
  type TableComponents,
  type TableProps,
  TableVirtuoso,
} from 'react-virtuoso'
import IconMdiChevronDown from '~icons/mdi/chevron-down'
import IconMdiTrashCan from '~icons/mdi/trash-can'
import { RecordProvenanceIcon } from '../components/cloud-save/ProvenanceBadge'
import { CloudMigrationPrompt } from '../components/cloud-save/CloudMigrationPrompt'
import {
  type ComboFlag,
  type PlayEntry,
  RatingCalculatorAddEntryForm,
  type SyncFlag,
} from '../components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorStatistics } from '../components/rating/RatingCalculatorStatistics'
import { ClearButton } from '../components/rating/io/ClearButton'
import { ExportMenu } from '../components/rating/io/ExportMenu'
import { NetImportSettingsButton } from '../components/rating/io/import/NetImportSettingsButton'
import { ImportMenu } from '../components/rating/io/ImportMenu'
import { ImportUndoBanner } from '../components/rating/io/import/ImportUndoBanner'
import { RenderToOneShotImageButton } from '../components/rating/io/export/RenderToOneShotImageButton'
import { useRatingEntries, useRatingView } from '../components/rating/useRatingEntries'
import { Link, useNavigate } from '@tanstack/react-router'
import { SheetListItem, SheetListItemContent } from '../components/sheet/SheetListItem'
import { useScoreEntries, useScoreRepository } from '../models/scores/useScoreRepository'
import { achievementRateBand, captureAnalyticsEvent } from '../lib/analytics'
import { type FlattenedSheet, useSheets } from '../songs'
import type { Rating } from '../utils/rating'
import { DIFFICULTIES } from '../models/difficulties'
import './rating-table.css'
import { difficultyInkClassName, difficultyInkStyle } from '@/utils/difficultyInk'
import { switchFocusRing } from '../components/rating/focusRing'

export interface Entry {
  sheet: FlattenedSheet
  rating: Rating | null
  sheetId: string
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
  /** The DX score of the play, when the source reports one */
  dxScore?: number
  includedIn: 'b15' | 'b35' | null
}

/** Row heights in px: denser on desktop, where the table has the width to keep each row on one line */
const ROW_HEIGHTS = { base: 88, desktop: 56 } as const

/** The desktop breakpoint of rating-table.css; keep the two in sync */
const DESKTOP_QUERY = '(min-width: 1024px)'

const columnHelper = createColumnHelper<Entry>()

/** Bucket first, then rating: the B50 order */
const DEFAULT_SORTING: SortingState = [
  { id: 'includedIn', desc: true },
  { id: 'rating', desc: true },
]

const isDefaultSorting = (sorting: SortingState) =>
  sorting.length === DEFAULT_SORTING.length &&
  sorting.every((sort, index) => sort.id === DEFAULT_SORTING[index]?.id && sort.desc === DEFAULT_SORTING[index]?.desc)

const RatingCalculatorRowActions: FC<{
  entry: PlayEntry
}> = ({ entry }) => {
  const repository = useScoreRepository()
  const { data: sheets } = useSheets()
  const [dialogOpen, setDialogOpen] = useState(false)
  const entries = useScoreEntries()
  const { t } = useTranslation(['rating-calculator'])

  const handleClick = useCallback(() => {
    repository.delete([entry.sheetId])
  }, [repository, entry.sheetId])

  const sheet = useMemo(() => sheets?.find((sheet) => sheet.id === entry.sheetId), [sheets, entry.sheetId])

  return (
    <>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('rating-calculator:table.remove-dialog.title')}</DialogTitle>
        <DialogContent>{sheet && <SheetListItemContent sheet={sheet} />}</DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('rating-calculator:table.remove-dialog.cancel')}</Button>

          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDialogOpen(false)
              handleClick()
              captureAnalyticsEvent('rating_calculator_remove_entry_button_clicked', {
                entry_count_before: entries.length,
                sheet_id: entry.sheetId,
              })
            }}
          >
            {t('rating-calculator:table.remove-dialog.remove')}
          </Button>
        </DialogActions>
      </Dialog>

      <IconButton
        size="small"
        aria-label={`${t('rating-calculator:table.remove-dialog.remove')} ${sheet?.title ?? ''}`}
        className="rating-row-remove"
        onClick={() => setDialogOpen(true)}
      >
        <IconMdiTrashCan />
      </IconButton>
    </>
  )
}

const TransparentPaper = styled(Paper)(() => ({
  backgroundColor: 'transparent',
  boxShadow: 'none',
}))

export const RatingCalculator = () => {
  const entries = useScoreEntries()
  const repository = useScoreRepository()
  const { data: sheets } = useSheets()
  const [showOnlyB50, setShowOnlyB50] = useState(false)
  const ratingView = useRatingView()
  const navigate = useNavigate()
  const { t } = useTranslation(['rating-calculator'])

  const { allEntries } = useRatingEntries()

  const onSubmit = useCallback(
    (entry: PlayEntry) => {
      // The saved entries, not the resolved ones: those are empty while the catalog loads
      const existingEntry = entries.find((existingEntry) => existingEntry.sheetId === entry.sheetId)
      repository.setManual(entry, 'typed')

      const sheet = sheets?.find((sheet) => sheet.id === entry.sheetId)
      if (sheet) {
        captureAnalyticsEvent('rating_calculator_entry_saved', {
          action: existingEntry ? 'updated' : 'added',
          achievement_rate_band: achievementRateBand(entry.achievementRate),
          entry_count: existingEntry ? entries.length : entries.length + 1,
          song_id: sheet.songId,
          sheet_type: sheet.type,
          sheet_difficulty: sheet.difficulty,
        })
      }
    },
    [entries, repository, sheets],
  )

  if (!sheets) return null

  return (
    <div className="rating-calculator flex-container w-full pb-global">
      <div className="rating-overview">
        <section className="glass rating-summary px-4 py-3" aria-labelledby="rating-breakdown-title">
          <RatingCalculatorStatistics titleId="rating-breakdown-title" />
        </section>

        <div className="rating-tools">
          <section className="glass w-full px-4 py-3" aria-labelledby="rating-records-title">
            <h2 id="rating-records-title" className="section-title m-0">
              {allEntries?.length
                ? t('rating-calculator:auto-save.saved-records', { count: allEntries.length })
                : t('rating-calculator:auto-save.title')}
            </h2>

            <div className="rating-oneshot mt-2">
              <RenderToOneShotImageButton />
            </div>

            <div className="rating-io-actions mt-2">
              <ImportMenu />
              <NetImportSettingsButton />
              <ExportMenu />
              <ClearButton />
            </div>

            {/* Signed in with cloud save on: the offer to back the local save up (never automatic) */}
            <CloudMigrationPrompt />
          </section>
          <ImportUndoBanner />
        </div>
      </div>

      <div className="glass rating-records w-full">
        <div className="rating-table-controls" role="group" aria-label={t('rating-calculator:quick-actions.title')}>
          <FormControlLabel
            control={
              <Switch
                sx={switchFocusRing}
                checked={showOnlyB50}
                onChange={() => {
                  const enabled = !showOnlyB50
                  setShowOnlyB50(enabled)
                  captureAnalyticsEvent('rating_calculator_view_changed', {
                    setting: 'show_only_b50',
                    enabled,
                  })
                }}
              />
            }
            label={t('rating-calculator:quick-actions.show-only-b50')}
          />

          <FormControlLabel
            control={
              <Switch
                sx={switchFocusRing}
                checked={ratingView === 'ap50'}
                onChange={() => {
                  const enabled = ratingView !== 'ap50'
                  void navigate({ to: '/rating', search: enabled ? { view: 'ap50' } : {}, replace: true })
                  captureAnalyticsEvent('rating_calculator_view_changed', { setting: 'ap50', enabled })
                }}
              />
            }
            label={t('rating-calculator:quick-actions.ap50')}
          />

          <Button component={Link} to="/me/records" size="small" variant="text">
            {t('toplists:entry-link')}
          </Button>
        </div>
        {ratingView === 'ap50' && (
          <Alert severity="info" className="mb-2">
            {t('rating-calculator:quick-actions.ap50-hint')}
          </Alert>
        )}
        <RatingCalculatorAddEntryForm onSubmit={onSubmit} />
        {/* With no records, the column headers would only frame an empty table */}
        {allEntries.length > 0 ? (
          <RatingCalculatorTableContent showOnlyB50={showOnlyB50} />
        ) : (
          <div className="w-full text-sm py-8 px-4 text-center">{t('rating-calculator:table.no-entries')}</div>
        )}
      </div>
    </div>
  )
}

const RatingCalculatorIncludedInCell: FC<{
  row: Row<Entry>
}> = memo(({ row }) => {
  const includedIn = row.original.includedIn
  if (!includedIn) return null

  return (
    <span
      className={clsx(
        'inline-block num w-12 leading-none py-1.5 rounded-full text-center text-xs font-semibold select-none',
        // A pale fill with a deep label of the same hue (>=4.5:1); both ends mirror on the dark theme
        includedIn === 'b15' && 'bg-amber-100 text-amber-900',
        includedIn === 'b35' && 'bg-cyan-100 text-cyan-900',
      )}
    >
      {includedIn.toUpperCase()}
    </span>
  )
})
RatingCalculatorIncludedInCell.displayName = 'memo(RatingCalculatorIncludedInCell)'

// Pale fills with deep labels of the same hue (>=4.5:1 at 12px); the adaptive palette mirrors both on the dark theme
const COMBO_FLAG_CONFIG: Record<NonNullable<ComboFlag>, { label: string; className: string; rank: number }> = {
  fc: { label: 'FC', className: 'bg-green-100 text-green-800', rank: 1 },
  fcp: { label: 'FC+', className: 'bg-green-200 text-green-900', rank: 2 },
  ap: { label: 'AP', className: 'bg-amber-100 text-amber-800', rank: 3 },
  app: { label: 'AP+', className: 'bg-amber-200 text-amber-900', rank: 4 },
}

const SYNC_FLAG_CONFIG: Record<NonNullable<SyncFlag>, { label: string; className: string; rank: number }> = {
  sync: { label: 'SYNC', className: 'bg-sky-100 text-sky-800', rank: 1 },
  fs: { label: 'FS', className: 'bg-blue-100 text-blue-800', rank: 2 },
  fsp: { label: 'FS+', className: 'bg-blue-200 text-blue-900', rank: 3 },
  fsd: { label: 'FSD', className: 'bg-fuchsia-100 text-fuchsia-800', rank: 4 },
  fsdp: { label: 'FSD+', className: 'bg-fuchsia-200 text-fuchsia-900', rank: 5 },
}

// The same 24px box as the B15/B35 pill, so the chips in a row share a height and a centre line
const FlagPill: FC<{ label: string; className: string }> = ({ label, className }) => (
  <span
    className={clsx(
      'inline-flex items-center justify-center h-6 min-w-12 px-2 rounded-full text-xs font-semibold leading-none select-none',
      className,
    )}
  >
    {label}
  </span>
)

const RatingCalculatorComboFlagCell: FC<{
  row: Row<Entry>
}> = memo(({ row }) => {
  const { comboFlag } = row.original
  if (!comboFlag) return null
  return <FlagPill label={COMBO_FLAG_CONFIG[comboFlag].label} className={COMBO_FLAG_CONFIG[comboFlag].className} />
})
RatingCalculatorComboFlagCell.displayName = 'memo(RatingCalculatorComboFlagCell)'

const RatingCalculatorSyncFlagCell: FC<{
  row: Row<Entry>
}> = memo(({ row }) => {
  const { syncFlag } = row.original
  if (!syncFlag) return null
  return <FlagPill label={SYNC_FLAG_CONFIG[syncFlag].label} className={SYNC_FLAG_CONFIG[syncFlag].className} />
})
RatingCalculatorSyncFlagCell.displayName = 'memo(RatingCalculatorSyncFlagCell)'

const RatingChartCell: FC<{ row: Row<Entry> }> = ({ row }) => {
  const { sheet, achievementRate } = row.original
  const difficulty = DIFFICULTIES[sheet.difficulty as keyof typeof DIFFICULTIES]
  return (
    <SheetListItem
      sheet={sheet}
      className="rating-chart-link"
      analytics={{ source: 'rating_calculator' }}
      SheetDialogContentProps={{ currentAchievementRate: achievementRate }}
    >
      <img
        className="rating-chart-cover"
        src={`https://shama.dxrating.net/images/cover/v2/${sheet.imageName}.jpg`}
        alt=""
        loading="lazy"
        width={40}
        height={40}
      />
      <span className="rating-chart-copy">
        <span className="rating-chart-title" title={sheet.title} lang="ja" translate="no">
          {sheet.title}
        </span>
        <span className="rating-chart-meta">
          <span className={difficultyInkClassName} style={difficultyInkStyle(sheet.difficulty)}>
            {difficulty?.title ?? sheet.difficulty}
          </span>
          <span>
            {sheet.type.toUpperCase()}
            {/* Desktop has a column of its own for the level */}
            <span className="rating-chart-meta-level"> · {sheetLevelLabel(sheet)}</span>
          </span>
        </span>
        <span className="rating-mobile-flags">
          <RatingCalculatorComboFlagCell row={row} />
          <RatingCalculatorSyncFlagCell row={row} />
        </span>
      </span>
    </SheetListItem>
  )
}

const sheetLevelLabel = (sheet: FlattenedSheet) =>
  sheet.isTypeUtage ? sheet.level : (sheet.internalLevelValue?.toFixed(1) ?? sheet.level)

const RatingCalculatorInternalLevelCell: FC<{
  row: Row<Entry>
}> = ({ row }) => <span className="num">{sheetLevelLabel(row.original.sheet)}</span>

const RatingCalculatorDxScoreCell: FC<{
  row: Row<Entry>
}> = ({ row }) => {
  const { dxScore, sheet } = row.original
  if (dxScore === undefined) return <span className="text-secondary">—</span>
  const total = sheet.noteCounts.total
  return (
    <span className="num">
      {dxScore}
      {total ? <span className="text-xs text-secondary"> / {total * 3}</span> : null}
    </span>
  )
}

const RatingCalculatorAchievementRateCell: FC<{
  row: Row<Entry>
}> = ({ row }) => (
  <>
    <span className="num">{row.original.achievementRate.toFixed(4)}%</span>
    {/* Cloud saves only: where the score came from */}
    <RecordProvenanceIcon sheetId={row.original.sheetId} className="rating-provenance-icon ms-1" />
  </>
)

const RATING_COLUMN_IDS = [
  'chart',
  'includedIn',
  'comboFlag',
  'syncFlag',
  'internalLevel',
  'dxScore',
  'achievementRate',
  'rating',
  'actions',
]

const RatingCalculatorTable: FC<TableProps> = ({ children, style, ...props }) => (
  <Table
    {...props}
    size="small"
    className="rating-table"
    style={{ ...style, tableLayout: 'fixed', borderCollapse: 'separate' }}
  >
    <colgroup>
      {RATING_COLUMN_IDS.map((id) => (
        <col key={id} className={`rating-col--${id}`} />
      ))}
    </colgroup>
    {children}
  </Table>
)

function RatingCalculatorTableBody({ ref, ...props }: TableBodyProps & { ref?: React.Ref<HTMLTableSectionElement> }) {
  return <TableBody {...props} ref={ref} />
}

const RatingCalculatorTableRow: FC<ItemProps<Row<Entry>>> = ({ item, ...props }) => (
  <TableRow {...props} className="rating-table-row tabular-nums" data-bucket={item.original.includedIn ?? 'none'} />
)

function RatingCalculatorScroller({ ref, ...props }: ScrollerProps & { ref?: React.Ref<HTMLDivElement> }) {
  return <TableContainer component={TransparentPaper} {...props} ref={ref} sx={{ overflow: 'clip' }} />
}

const RatingCalculatorRatingCell: FC<{
  row: Row<Entry>
}> = ({ row }) => <span className="num">{row.original.rating ? row.original.rating.ratingAwardValue : '-'}</span>

const RatingCalculatorTableRowContent: FC<{
  row: Row<Entry>
}> = ({ row }) => {
  return (
    <>
      {row.getVisibleCells().map((cell) => {
        return (
          <TableCell
            key={cell.id}
            {...(
              cell.column.columnDef.meta as {
                cellProps?: Record<string, unknown>
              }
            )?.cellProps}
            className={`rating-col--${cell.column.id}`}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        )
      })}
    </>
  )
}

/**
 * A column header: the label, then a small chevron in the text colour when the column is sorted. The priority number
 * is a superscript, shown only for a multi-column sort other than the default order. An unsorted sortable column
 * shows a faint chevron on hover and focus only.
 */
const RatingTableSortButton: FC<{
  label: ReactNode
  canSort: boolean
  sorted: false | SortDirection
  priority: number | null
  /** Draw the priority superscript; screen readers hear the priority either way */
  showPriority: boolean
  /** A secondary key of the default order: drawn like an unsorted column */
  quiet: boolean
  onClick?: (event: unknown) => void
}> = ({ label, canSort, sorted, priority, showPriority, quiet, onClick }) => {
  const { t } = useTranslation(['rating-calculator'])
  const shownSorted = quiet ? false : sorted
  return (
    <button
      type="button"
      className="rating-table-sort"
      data-sorted={shownSorted || undefined}
      disabled={!canSort}
      onClick={onClick}
    >
      <span className="rating-table-sort-label">{label}</span>
      {canSort && (
        <span className="rating-table-sort-indicator" aria-hidden="true">
          <IconMdiChevronDown className={clsx('rating-table-sort-chevron', shownSorted === 'asc' && 'rotate-180')} />
          {shownSorted && showPriority && priority !== null && (
            <sup className="rating-table-sort-priority">{priority}</sup>
          )}
        </span>
      )}
      {sorted && priority !== null && (
        <span className="sr-only">{t('rating-calculator:table.sort-priority', { n: priority })}</span>
      )}
    </button>
  )
}

function RatingCalculatorTableContent({ showOnlyB50 }: { showOnlyB50: boolean }) {
  const { allEntries } = useRatingEntries()
  const { t } = useTranslation(['rating-calculator'])

  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING)
  const defaultSorting = isDefaultSorting(sorting)

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'chart',
        header: t('rating-calculator:table.headers.chart'),
        cell: ({ row }) => <RatingChartCell row={row} />,
        meta: {
          cellProps: {
            padding: 'none',
          },
        },
      }),
      columnHelper.accessor((entry) => entry.includedIn ?? undefined, {
        id: 'includedIn',
        header: t('rating-calculator:table.headers.included-in'),
        cell: RatingCalculatorIncludedInCell,
        sortUndefined: 'last',
      }),
      columnHelper.accessor('comboFlag', {
        id: 'comboFlag',
        header: t('rating-calculator:table.headers.combo'),
        cell: RatingCalculatorComboFlagCell,
        sortingFn: (a, b) => {
          const rankA = a.original.comboFlag ? COMBO_FLAG_CONFIG[a.original.comboFlag].rank : 0
          const rankB = b.original.comboFlag ? COMBO_FLAG_CONFIG[b.original.comboFlag].rank : 0
          return rankA - rankB
        },
      }),
      columnHelper.accessor('syncFlag', {
        id: 'syncFlag',
        header: t('rating-calculator:table.headers.sync'),
        cell: RatingCalculatorSyncFlagCell,
        sortingFn: (a, b) => {
          const rankA = a.original.syncFlag ? SYNC_FLAG_CONFIG[a.original.syncFlag].rank : 0
          const rankB = b.original.syncFlag ? SYNC_FLAG_CONFIG[b.original.syncFlag].rank : 0
          return rankA - rankB
        },
      }),
      // Desktop only (hidden under 1024px in rating-table.css), like the combo and sync columns under 768px
      columnHelper.accessor((entry) => entry.sheet.internalLevelValue, {
        id: 'internalLevel',
        header: t('rating-calculator:table.headers.internal-level'),
        cell: RatingCalculatorInternalLevelCell,
      }),
      columnHelper.accessor((entry) => entry.dxScore, {
        id: 'dxScore',
        header: t('rating-calculator:table.headers.dx-score'),
        cell: RatingCalculatorDxScoreCell,
        sortUndefined: 'last',
      }),
      columnHelper.accessor('achievementRate', {
        id: 'achievementRate',
        header: t('rating-calculator:table.headers.achievement-rate'),
        cell: RatingCalculatorAchievementRateCell,
      }),
      columnHelper.accessor('rating.ratingAwardValue', {
        id: 'rating',
        header: t('rating-calculator:table.headers.rating'),
        cell: ({ row }) => (
          <div className="rating-value-cell">
            <RatingCalculatorRatingCell row={row} />
            <span className="rating-mobile-action">
              <RatingCalculatorRowActions entry={row.original} />
            </span>
          </div>
        ),
        sortingFn: (a, b) => {
          if (!a.original.rating) return -1
          if (!b.original.rating) return 1
          return a.original.rating.ratingAwardValue - b.original.rating.ratingAwardValue
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: t('rating-calculator:table.headers.actions'),
        cell: ({ row }) => <RatingCalculatorRowActions entry={row.original} />,
      }),
    ],
    [t],
  )

  const data = useMemo(() => {
    return showOnlyB50 ? allEntries.filter((entry) => entry.includedIn) : allEntries
  }, [allEntries, showOnlyB50])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    getRowId: (entry) => entry.sheetId,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const TableComponents = useMemo(
    () =>
      ({
        Scroller: RatingCalculatorScroller,
        Table: RatingCalculatorTable,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- it is sort of impossible to type this
        TableHead: TableHead as any,
        TableRow: RatingCalculatorTableRow,
        TableBody: RatingCalculatorTableBody,
      }) as TableComponents<Row<Entry>>,
    [],
  )

  const getItemContent = useCallback((_: number, row: Row<Entry>) => <RatingCalculatorTableRowContent row={row} />, [])

  // False on the first render (as on the server), then follows the viewport; the CSS sets the row height to match
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const rowHeight = ROW_HEIGHTS[isDesktop ? 'desktop' : 'base']

  // The header sits on the records panel like the form above it; only once it sticks over the rows does it take the
  // glass material and a shadow. A sentinel just above the table scrolls out of view at that moment.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [headerStuck, setHeaderStuck] = useState(false)
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || typeof IntersectionObserver === 'undefined') return
    // The root reaches far below the viewport, so the sentinel counts as intersecting anywhere from the top edge down.
    // Crossing the top edge is then the only transition, and a scroll jump past the whole viewport still reports it.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setHeaderStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      { rootMargin: '0px 0px 1000000px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="rating-table-wrap" data-stuck={headerStuck || undefined}>
      <div ref={sentinelRef} className="rating-table-sentinel" aria-hidden="true" />
      <TableVirtuoso<Row<Entry>>
        // Virtuoso caches item measurements; a breakpoint change must discard the previous row heights.
        key={isDesktop ? 'desktop' : 'base'}
        useWindowScroll
        fixedItemHeight={rowHeight}
        computeItemKey={(_, row) => row.original.sheetId}
        data={table.getRowModel().rows}
        className="w-full"
        increaseViewportBy={400}
        overscan={10}
        components={TableComponents}
        fixedHeaderContent={() =>
          table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableCell
                    key={header.id}
                    colSpan={header.colSpan}
                    className={`rating-col--${header.column.id}`}
                    scope="col"
                    sortDirection={header.column.getIsSorted() || false}
                  >
                    {header.isPlaceholder ? null : (
                      <RatingTableSortButton
                        label={flexRender(header.column.columnDef.header, header.getContext())}
                        canSort={header.column.getCanSort()}
                        sorted={header.column.getIsSorted()}
                        // The priority only means something when more than one column is sorted
                        priority={sorting.length > 1 ? header.column.getSortIndex() + 1 : null}
                        // The default order (bucket, then rating) reads as a plain bucket sort: one chevron, no
                        // numbers. A multi-sort the user builds shows its order as superscripts
                        showPriority={!defaultSorting}
                        quiet={defaultSorting && header.column.getSortIndex() > 0}
                        onClick={header.column.getToggleSortingHandler()}
                      />
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))
        }
        itemContent={getItemContent}
      />
    </div>
  )
}