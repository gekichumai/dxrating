import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grow,
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
} from '@mui/material'
import {
  type Row,
  type SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import clsx from 'clsx'
import { type FC, memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import {
  type ItemProps,
  type ScrollerProps,
  type TableBodyProps,
  type TableComponents,
  type TableProps,
  TableVirtuoso,
} from 'react-virtuoso'
import IconMdiArrowDown from '~icons/mdi/arrow-down'
import IconMdiTrashCan from '~icons/mdi/trash-can'
import { BetaBadge } from '../components/global/BetaBadge'
import {
  type ComboFlag,
  type PlayEntry,
  RatingCalculatorAddEntryForm,
  type SyncFlag,
} from '../components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorStatistics } from '../components/rating/RatingCalculatorStatistics'
import { ClearButton } from '../components/rating/io/ClearButton'
import { ExportMenu } from '../components/rating/io/ExportMenu'
import { ImportMenu } from '../components/rating/io/ImportMenu'
import { RenderToOneShotImageButton } from '../components/rating/io/export/RenderToOneShotImageButton'
import { useRatingEntries } from '../components/rating/useRatingEntries'
import { SheetListItem, SheetListItemContent } from '../components/sheet/SheetListItem'
import { useRatingCalculatorContext } from '../models/context/RatingCalculatorContext'
import { achievementRateBand, captureAnalyticsEvent } from '../lib/analytics'
import { type FlattenedSheet, useSheets } from '../songs'
import type { Rating } from '../utils/rating'
import { DIFFICULTIES } from '../models/difficulties'
import './rating-table.css'

export interface Entry {
  sheet: FlattenedSheet
  rating: Rating | null
  sheetId: string
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
  includedIn: 'b15' | 'b35' | null
}

const columnHelper = createColumnHelper<Entry>()

const RatingCalculatorRowActions: FC<{
  modifyEntries: ListActions<PlayEntry>
  entry: PlayEntry
}> = ({ modifyEntries, entry }) => {
  const { data: sheets } = useSheets()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { entries } = useRatingCalculatorContext()
  const { t } = useTranslation(['rating-calculator'])

  const handleClick = useCallback(() => {
    modifyEntries.filter((existingEntry) => existingEntry.sheetId !== entry.sheetId)
  }, [modifyEntries, entry.sheetId])

  const sheet = useMemo(() => sheets?.find((sheet) => sheet.id === entry.sheetId), [sheets, entry.sheetId])

  return (
    <>
      <Dialog TransitionComponent={Grow} open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
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
  const { modifyEntries } = useRatingCalculatorContext()
  const { data: sheets } = useSheets()
  const [showOnlyB50, setShowOnlyB50] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const { t } = useTranslation(['rating-calculator'])

  const { allEntries } = useRatingEntries()

  const onSubmit = useCallback(
    (entry: PlayEntry) => {
      const existingEntry = allEntries.find((existingEntry) => existingEntry.sheetId === entry.sheetId)
      if (existingEntry) {
        modifyEntries.updateFirst((existingEntry) => existingEntry.sheetId === entry.sheetId, entry)
      } else modifyEntries.push(entry)

      const sheet = sheets?.find((sheet) => sheet.id === entry.sheetId)
      if (sheet) {
        captureAnalyticsEvent('rating_calculator_entry_saved', {
          action: existingEntry ? 'updated' : 'added',
          achievement_rate_band: achievementRateBand(entry.achievementRate),
          entry_count: existingEntry ? allEntries.length : allEntries.length + 1,
          song_id: sheet.songId,
          sheet_type: sheet.type,
          sheet_difficulty: sheet.difficulty,
        })
      }
    },
    [allEntries, modifyEntries, sheets],
  )

  if (!sheets) return null

  return (
    <div className="rating-calculator flex-container w-full pb-global">
      <div className="rating-overview">
        <Alert icon={false} severity="info" className="rating-summary px-4 py-2" classes={{ message: 'w-full' }}>
          <AlertTitle className="font-bold">{t('rating-calculator:breakdown.title')}</AlertTitle>
          <RatingCalculatorStatistics />
        </Alert>

        <div className="rating-tools">
          <Alert
            icon={false}
            severity="info"
            className="w-full px-4 py-2"
            classes={{
              message: 'w-full',
            }}
          >
            <AlertTitle className="font-bold">
              {allEntries?.length
                ? t('rating-calculator:auto-save.saved-records', { count: allEntries.length })
                : t('rating-calculator:auto-save.title')}
            </AlertTitle>

            <div className="mt-2">
              <RenderToOneShotImageButton />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <ImportMenu modifyEntries={modifyEntries} />

              <ExportMenu />

              <div className="flex-1" />

              <ClearButton modifyEntries={modifyEntries} />
            </div>
          </Alert>
        </div>
      </div>

      <div className={clsx('rating-records w-full', compactMode && 'rating-records--compact')}>
        <div className="rating-table-controls" role="group" aria-label={t('rating-calculator:quick-actions.title')}>
          <FormControlLabel
            control={
              <Switch
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
                checked={compactMode}
                onChange={() => {
                  const enabled = !compactMode
                  setCompactMode(enabled)
                  captureAnalyticsEvent('rating_calculator_view_changed', {
                    setting: 'compact_mode',
                    enabled,
                  })
                }}
              />
            }
            label={
              <div className="flex items-center gap-1 leading-none">
                {t('rating-calculator:quick-actions.compact-mode')} <BetaBadge />
              </div>
            }
          />
        </div>
        <RatingCalculatorAddEntryForm onSubmit={onSubmit} />
        <RatingCalculatorTableContent compactMode={compactMode} showOnlyB50={showOnlyB50} />

        {allEntries.length === 0 && (
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
        'inline-block tabular-nums font-mono tracking-tighter w-12 leading-none py-1.5 rounded-full text-white text-center shadow select-none',
        includedIn === 'b15' && 'bg-amber-500',
        includedIn === 'b35' && 'bg-cyan-500',
      )}
    >
      {includedIn.toUpperCase()}
    </span>
  )
})
RatingCalculatorIncludedInCell.displayName = 'memo(RatingCalculatorIncludedInCell)'

const COMBO_FLAG_CONFIG: Record<NonNullable<ComboFlag>, { label: string; color: string; rank: number }> = {
  fc: { label: 'FC', color: '#22bb5b', rank: 1 },
  fcp: { label: 'FC+', color: '#169b48', rank: 2 },
  ap: { label: 'AP', color: '#f5c31a', rank: 3 },
  app: { label: 'AP+', color: '#e5a800', rank: 4 },
}

const SYNC_FLAG_CONFIG: Record<NonNullable<SyncFlag>, { label: string; color: string; rank: number }> = {
  sync: { label: 'SYNC', color: '#64b5f6', rank: 1 },
  fs: { label: 'FS', color: '#42a5f5', rank: 2 },
  fsp: { label: 'FS+', color: '#1e88e5', rank: 3 },
  fsd: { label: 'FSD', color: '#e040fb', rank: 4 },
  fsdp: { label: 'FSD+', color: '#c51dd4', rank: 5 },
}

const FlagPill: FC<{ label: string; color: string }> = ({ label, color }) => (
  <span
    className="rounded-full px-2 text-xs leading-relaxed text-white shadow-[0.0625rem_0.125rem_0_0_#0b38714D] select-none"
    style={{ backgroundColor: color }}
  >
    {label}
  </span>
)

const RatingCalculatorComboFlagCell: FC<{
  row: Row<Entry>
}> = memo(({ row }) => {
  const { comboFlag } = row.original
  if (!comboFlag) return null
  return <FlagPill label={COMBO_FLAG_CONFIG[comboFlag].label} color={COMBO_FLAG_CONFIG[comboFlag].color} />
})
RatingCalculatorComboFlagCell.displayName = 'memo(RatingCalculatorComboFlagCell)'

const RatingCalculatorSyncFlagCell: FC<{
  row: Row<Entry>
}> = memo(({ row }) => {
  const { syncFlag } = row.original
  if (!syncFlag) return null
  return <FlagPill label={SYNC_FLAG_CONFIG[syncFlag].label} color={SYNC_FLAG_CONFIG[syncFlag].color} />
})
RatingCalculatorSyncFlagCell.displayName = 'memo(RatingCalculatorSyncFlagCell)'

const RatingChartCell: FC<{ row: Row<Entry>; compactMode: boolean }> = ({ row, compactMode }) => {
  const { sheet, achievementRate } = row.original
  const difficulty = DIFFICULTIES[sheet.difficulty as keyof typeof DIFFICULTIES]
  return (
    <SheetListItem
      sheet={sheet}
      className="rating-chart-link"
      analytics={{ source: 'rating_calculator' }}
      SheetDialogContentProps={{ currentAchievementRate: achievementRate }}
    >
      {!compactMode && (
        <img
          className="rating-chart-cover"
          src={`https://shama.dxrating.net/images/cover/v2/${sheet.imageName}.jpg`}
          alt=""
          loading="lazy"
          width={40}
          height={40}
        />
      )}
      <span className="rating-chart-copy">
        <span className="rating-chart-title" title={sheet.title}>
          {sheet.title}
        </span>
        <span className="rating-chart-meta">
          <span style={{ color: difficulty?.color }}>{difficulty?.title ?? sheet.difficulty}</span>
          <span>
            {sheet.type.toUpperCase()} ·{' '}
            {sheet.isTypeUtage ? sheet.level : (sheet.internalLevelValue?.toFixed(1) ?? sheet.level)}
          </span>
        </span>
        <span className="rating-mobile-flags">
          <RatingCalculatorIncludedInCell row={row} />
          <RatingCalculatorComboFlagCell row={row} />
          <RatingCalculatorSyncFlagCell row={row} />
        </span>
      </span>
    </SheetListItem>
  )
}

const RatingCalculatorAchievementRateCell: FC<{
  row: Row<Entry>
}> = ({ row }) => (
  <span className="font-sans tracking-wide tabular-nums">{row.original.achievementRate.toFixed(4)}%</span>
)

const RATING_COLUMN_IDS = ['chart', 'includedIn', 'comboFlag', 'syncFlag', 'achievementRate', 'rating', 'actions']

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
}> = ({ row }) => (
  <span className="font-sans tabular-nums">{row.original.rating ? row.original.rating.ratingAwardValue : '-'}</span>
)

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

function RatingCalculatorTableContent({ compactMode, showOnlyB50 }: { compactMode: boolean; showOnlyB50: boolean }) {
  const { allEntries } = useRatingEntries()
  const { modifyEntries } = useRatingCalculatorContext()
  const { t } = useTranslation(['rating-calculator'])

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'includedIn', desc: true },
    { id: 'rating', desc: true },
  ])

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'chart',
        header: t('rating-calculator:table.headers.chart'),
        cell: ({ row }) => <RatingChartCell row={row} compactMode={compactMode} />,
        meta: {
          cellProps: {
            padding: 'none',
          },
        },
      }),
      columnHelper.accessor('includedIn', {
        id: 'includedIn',
        header: t('rating-calculator:table.headers.included-in'),
        cell: RatingCalculatorIncludedInCell,
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
              <RatingCalculatorRowActions entry={row.original} modifyEntries={modifyEntries} />
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
        cell: ({ row }) => <RatingCalculatorRowActions entry={row.original} modifyEntries={modifyEntries} />,
      }),
    ],
    [modifyEntries, compactMode, t],
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

  return (
    <TableVirtuoso<Row<Entry>>
      // Virtuoso caches item measurements; a density change must discard the previous row heights.
      key={compactMode ? 'compact' : 'comfortable'}
      useWindowScroll
      fixedItemHeight={compactMode ? 72 : 88}
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
                  className={`rating-col--${header.column.id} group`}
                  scope="col"
                  sortDirection={header.column.getIsSorted() || false}
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className="rating-table-sort"
                      disabled={!header.column.getCanSort()}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      <div
                        className={clsx(
                          'inline-flex items-center overflow-hidden relative',
                          header.column.getIsSorted() && 'bg-gray-900/50 text-zinc-100 rounded-full',
                        )}
                      >
                        <IconMdiArrowDown
                          className={clsx(
                            'ml-1 transition mr-0.5',
                            {
                              asc: 'inline-flex rotate-180',
                              desc: 'inline-flex rotate-0',
                              none: header.column.getCanSort()
                                ? 'inline-flex opacity-0 group-hover:opacity-70'
                                : 'hidden',
                            }[(header.column.getIsSorted() as string) || 'none'],
                          )}
                        />
                        {header.column.getIsSorted() && sorting.length > 1 && (
                          <div className="inline-flex items-center justify-center text-sm px-2 font-bold bg-gray-9/50">
                            {header.column.getSortIndex() + 1}
                          </div>
                        )}
                      </div>
                    </button>
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))
      }
      itemContent={getItemContent}
    />
  )
}