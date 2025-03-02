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
  styled,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import clsx from 'clsx'
import { type FC, type ForwardedRef, forwardRef, memo, useCallback, useMemo, useState } from 'react'
import type { ListActions } from 'react-use/lib/useList'
import { type ItemProps, type ScrollerProps, type TableBodyProps, type TableComponents, type TableProps, TableVirtuoso } from 'react-virtuoso'
import IconMdiArrowDown from '~icons/mdi/arrow-down'
import IconMdiTrashCan from '~icons/mdi/trash-can'
import { BetaBadge } from '../components/global/BetaBadge'
import { ClearButton } from '../components/rating/io/ClearButton'
import { RenderToOneShotImageButton } from '../components/rating/io/export/RenderToOneShotImageButton'
import { ExportMenu } from '../components/rating/io/ExportMenu'
import { ImportMenu } from '../components/rating/io/ImportMenu'
import { type PlayEntry, RatingCalculatorAddEntryForm } from '../components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorStatistics } from '../components/rating/RatingCalculatorStatistics'
import { useRatingEntries } from '../components/rating/useRatingEntries'
import { SheetListItem, SheetListItemContent } from '../components/sheet/SheetListItem'
import { useRatingCalculatorContext } from '../models/context/RatingCalculatorContext'
import { type FlattenedSheet, useSheets } from '../songs'
import type { Rating } from '../utils/rating'

export interface Entry {
  sheet: FlattenedSheet
  rating: Rating | null
  sheetId: string
  achievementRate: number
  includedIn: 'b15' | 'b35' | null
}

const columnHelper = createColumnHelper<Entry>()

const RatingCalculatorRowActions: FC<{
  modifyEntries: ListActions<PlayEntry>
  entry: PlayEntry
}> = ({ modifyEntries, entry }) => {
  const { data: sheets } = useSheets()
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleClick = useCallback(() => {
    modifyEntries.filter((existingEntry) => existingEntry.sheetId !== entry.sheetId)
  }, [])

  const sheet = useMemo(() => sheets?.find((sheet) => sheet.id === entry.sheetId), [sheets, entry.sheetId])

  return (
    <>
      <Dialog
        TransitionComponent={Grow}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        classes={{
          paper: 'min-w-[20rem]',
        }}
      >
        <DialogTitle>Remove rating entry?</DialogTitle>
        <DialogContent>{sheet && <SheetListItemContent sheet={sheet} />}</DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>

          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDialogOpen(false)
              handleClick()
            }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      <IconButton size="small" onClick={() => setDialogOpen(true)}>
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

  const { allEntries } = useRatingEntries()

  const onSubmit = useCallback(
    (entry: PlayEntry) => {
      if (allEntries.some((existingEntry) => existingEntry.sheetId === entry.sheetId)) {
        modifyEntries.updateFirst((existingEntry) => existingEntry.sheetId === entry.sheetId, entry)
      } else modifyEntries.push(entry)
    },
    [allEntries, modifyEntries],
  )

  if (!sheets) return null

  return (
    <div className="flex-container w-full pb-global">
      <div className="flex flex-col md:flex-row items-start gap-4 w-full">
        <Alert icon={false} severity="info" className="px-4 py-2 w-full md:w-2/3" classes={{ message: 'w-full' }}>
          <AlertTitle className="font-bold">Rating Breakdown</AlertTitle>
          <RatingCalculatorStatistics />
        </Alert>

        <div className="flex flex-col gap-4 h-full self-stretch w-full md:w-1/3">
          <Alert
            icon={false}
            severity="info"
            className="w-full overflow-auto px-4 py-2"
            classes={{
              message: 'w-full',
            }}
          >
            <AlertTitle className="font-bold">
              {allEntries?.length ? `Saved ${allEntries.length} records` : 'Auto-save'}
            </AlertTitle>

            <div className="mt-2">
              <RenderToOneShotImageButton />
            </div>

            <div className="flex items-center gap-2 mt-2">
              <ImportMenu modifyEntries={modifyEntries} />

              <ExportMenu />

              <div className="flex-1" />

              <ClearButton modifyEntries={modifyEntries} />
            </div>
          </Alert>

          <Alert
            icon={false}
            severity="info"
            className="w-full px-4 py-2"
            classes={{
              message: 'overflow-unset',
            }}
          >
            <AlertTitle className="font-bold">Quick Actions</AlertTitle>
            <div className="flex flex-col items-start mt-2">
              <FormControlLabel
                control={<Switch checked={showOnlyB50} onChange={() => setShowOnlyB50((prev) => !prev)} />}
                label="Show only B50 entries"
              />

              <FormControlLabel
                control={<Switch checked={compactMode} onChange={() => setCompactMode((prev) => !prev)} />}
                label={
                  <div className="flex items-center gap-1 leading-none">
                    Compact Mode <BetaBadge />
                  </div>
                }
              />
            </div>
          </Alert>
        </div>
      </div>

      <RatingCalculatorAddEntryForm onSubmit={onSubmit} />

      <div className="max-w-screen w-full overflow-x-auto -mx-4">
        <RatingCalculatorTableContent compactMode={compactMode} showOnlyB50={showOnlyB50} />

        {allEntries.length === 0 && <div className="w-full text-sm py-8 px-4 text-center">No entries</div>}
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
    <div
      className={clsx(
        'tabular-nums font-mono tracking-tighter w-12 leading-none py-1.5 rounded-full text-white text-center shadow select-none',
        includedIn === 'b15' && 'bg-amber-500',
        includedIn === 'b35' && 'bg-cyan-500',
      )}
    >
      {includedIn.toUpperCase()}
    </div>
  )
})
RatingCalculatorIncludedInCell.displayName = 'memo(RatingCalculatorIncludedInCell)'

const RatingCalculatorAchievementRateCell: FC<{
  row: Row<Entry>
}> = ({ row }) => (
  <span className="font-sans tracking-wide tabular-nums">{row.original.achievementRate.toFixed(4)}%</span>
)

const RatingCalculatorTable: FC<TableProps> = (props: TableProps) => (
  <Table {...props} size="small" className="rounded-lg w-full min-w-2xl" style={{ borderCollapse: 'separate' }} />
)

const RatingCalculatorTableBody = forwardRef((props: TableBodyProps, ref: ForwardedRef<HTMLTableSectionElement>) => (
  <TableBody {...props} ref={ref} />
))

const RatingCalculatorTableRow: FC<ItemProps<Row<Entry>>> = ({ item, ...props }) => (
  <TableRow
    {...props}
    className={clsx(
      'tabular-nums w-full',
      {
        b15: 'bg-amber-200',
        b35: 'bg-cyan-200',
        none: undefined,
      }[item.original.includedIn ?? 'none'],
    )}
  />
)

const RatingCalculatorScroller = forwardRef((props: ScrollerProps, ref: ForwardedRef<HTMLDivElement>) => (
  <TableContainer component={TransparentPaper} {...props} ref={ref} />
))

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
            style={{ width: cell.column.getSize() }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        )
      })}
    </>
  )
}

function RatingCalculatorTableContent({
  compactMode,
  showOnlyB50,
}: {
  compactMode: boolean
  showOnlyB50: boolean
}) {
  const { allEntries } = useRatingEntries()
  const { modifyEntries } = useRatingCalculatorContext()

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'includedIn', desc: true },
    { id: 'rating', desc: true },
  ])

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'chart',
        header: 'Chart',
        cell: ({ row }) => (
          <SheetListItem
            sheet={row.original.sheet}
            SheetDialogContentProps={{
              currentAchievementRate: row.original.achievementRate,
            }}
            SheetListItemContentProps={{
              enableSheetImage: !compactMode,
              SheetTitleProps: {
                enableVersion: false,
                className: 'flex-col',
              },
              ListItemTextProps: {
                className: clsx('!my-0', compactMode ? '!ml-0' : '!ml-1'),
              },
            }}
          />
        ),
        meta: {
          cellProps: {
            padding: 'none',
          },
        },
        size: 700,
        minSize: 400,
      }),
      columnHelper.accessor('includedIn', {
        id: 'includedIn',
        header: 'Incl. In',
        cell: RatingCalculatorIncludedInCell,
        size: 50,
        minSize: 100,
      }),
      columnHelper.accessor('achievementRate', {
        id: 'achievementRate',
        header: 'Achievement Rate',
        cell: RatingCalculatorAchievementRateCell,
        size: 100,
        minSize: 150,
      }),
      columnHelper.accessor('rating.ratingAwardValue', {
        id: 'rating',
        header: 'Rating',
        cell: RatingCalculatorRatingCell,
        size: 50,
        minSize: 100,
        sortingFn: (a, b) => {
          if (!a.original.rating) return -1
          if (!b.original.rating) return 1
          return a.original.rating.ratingAwardValue - b.original.rating.ratingAwardValue
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <RatingCalculatorRowActions entry={row.original} modifyEntries={modifyEntries} />,
        size: 50,
        minSize: 100,
      }),
    ],
    [modifyEntries, compactMode],
  )

  const data = useMemo(() => {
    return showOnlyB50 ? allEntries.filter((entry) => entry.includedIn) : allEntries
  }, [allEntries, showOnlyB50])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    isMultiSortEvent: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const TableComponents: TableComponents<Row<Entry>> = useMemo(
    () => ({
      Scroller: RatingCalculatorScroller,
      Table: RatingCalculatorTable,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      TableHead: TableHead as any,
      TableRow: RatingCalculatorTableRow,
      TableBody: RatingCalculatorTableBody,
    }),
    [compactMode],
  )

  const getItemContent = useCallback(
    (index: number) => <RatingCalculatorTableRowContent row={table.getRowModel().rows[index]} />,
    [table],
  )

  return (
    <TableVirtuoso<Row<Entry>>
      useWindowScroll
      data={table.getRowModel().rows}
      className="w-full overflow-y-hidden"
      increaseViewportBy={2000}
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
                  className={clsx(
                    'group bg-gray-900/5 transition',
                    header.column.getCanSort() &&
                      'cursor-pointer select-none hover:bg-gray-900/10 active:bg-gray-900/20 leading-tight py-4',
                  )}
                  onClick={header.column.getToggleSortingHandler()}
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder ? null : (
                    <div>
                      {flexRender(header.column.columnDef.header, header.getContext())}
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
                    </div>
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
