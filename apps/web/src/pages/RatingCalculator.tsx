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
} from "@mui/material";
import {
  Row,
  SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import clsx from "clsx";
import {
  FC,
  ForwardedRef,
  forwardRef,
  memo,
  useCallback,
  useMemo,
  useState,
} from "react";
import { ListActions } from "react-use/lib/useList";
import {
  ItemProps,
  ScrollerProps,
  TableBodyProps,
  TableComponents,
  TableProps,
  TableVirtuoso,
} from "react-virtuoso";
import IconMdiArrowUp from "~icons/mdi/arrow-up";
import IconMdiTrashCan from "~icons/mdi/trash-can";
import { BetaBadge } from "../components/global/BetaBadge";
import {
  PlayEntry,
  RatingCalculatorAddEntryForm,
} from "../components/rating/RatingCalculatorAddEntryForm";
import { ClearButton } from "../components/rating/io/ClearButton";
import { ExportMenu } from "../components/rating/io/ExportMenu";
import { ImportMenu } from "../components/rating/io/ImportMenu";
import { RenderToOneShotImageButton } from "../components/rating/io/export/RenderToOneShotImageButton";
import { useRatingEntries } from "../components/rating/useRatingEntries";
import {
  SheetListItem,
  SheetListItemContent,
} from "../components/sheet/SheetListItem";
import { useRatingCalculatorContext } from "../models/RatingCalculatorContext";
import { FlattenedSheet, useSheets } from "../songs";
import { Rating } from "../utils/rating";

export interface Entry {
  sheet: FlattenedSheet;
  rating: Rating | null;
  sheetId: string;
  achievementRate: number;
  includedIn: "b15" | "b35" | null;
}

const columnHelper = createColumnHelper<Entry>();

const RatingCalculatorRowActions: FC<{
  modifyEntries: ListActions<PlayEntry>;
  entry: PlayEntry;
}> = ({ modifyEntries, entry }) => {
  const { data: sheets } = useSheets();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = useCallback(() => {
    modifyEntries.filter(
      (existingEntry) => existingEntry.sheetId !== entry.sheetId,
    );
  }, []);

  const sheet = useMemo(
    () => sheets?.find((sheet) => sheet.id === entry.sheetId),
    [sheets, entry.sheetId],
  );

  return (
    <>
      <Dialog
        TransitionComponent={Grow}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        classes={{
          paper: "min-w-[20rem]",
        }}
      >
        <DialogTitle>Remove rating entry?</DialogTitle>
        <DialogContent>
          {sheet && <SheetListItemContent sheet={sheet} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>

          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDialogOpen(false);
              handleClick();
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
  );
};

const DenseTableCell = styled(TableCell)(({ theme }) => ({
  padding: theme.spacing(0.75 + 0.0625, 1),
}));

const TransparentPaper = styled(Paper)(() => ({
  backgroundColor: "transparent",
  boxShadow: "none",
}));

export const RatingCalculator = () => {
  const { modifyEntries } = useRatingCalculatorContext();
  const { data: sheets } = useSheets();
  const [showOnlyB50, setShowOnlyB50] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "rating", desc: true },
  ]);

  const { allEntries } = useRatingEntries();

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "chart",
        header: "Chart",
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
                className: "flex-col",
              },
              ListItemTextProps: {
                className: clsx("!my-0", compactMode ? "!ml-0" : "!ml-1"),
              },
            }}
          />
        ),
        meta: {
          cellProps: {
            padding: "none",
          },
        },
        size: 700,
        minSize: 400,
      }),
      columnHelper.accessor("includedIn", {
        id: "includedIn",
        header: "Incl. In",
        cell: RatingCalculatorIncludedInCell,
        size: 50,
        minSize: 100,
      }),
      columnHelper.accessor("achievementRate", {
        id: "achievementRate",
        header: "Achievement Rate",
        cell: RatingCalculatorAchievementRateCell,
        size: 100,
        minSize: 150,
      }),
      columnHelper.accessor("rating.ratingAwardValue", {
        id: "rating",
        header: "Rating",
        cell: RatingCalculatorRatingCell,
        size: 50,
        minSize: 100,
        sortingFn: (a, b) => {
          if (!a.original.rating) return -1;
          if (!b.original.rating) return 1;
          return (
            a.original.rating.ratingAwardValue -
            b.original.rating.ratingAwardValue
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <RatingCalculatorRowActions
            entry={row.original}
            modifyEntries={modifyEntries}
          />
        ),
        size: 50,
        minSize: 100,
      }),
    ],
    [modifyEntries, compactMode],
  );

  const data = useMemo(() => {
    return showOnlyB50
      ? allEntries.filter((entry) => entry.includedIn)
      : allEntries;
  }, [allEntries, showOnlyB50]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const onSubmit = useCallback(
    (entry: PlayEntry) => {
      if (
        allEntries.some(
          (existingEntry) => existingEntry.sheetId === entry.sheetId,
        )
      ) {
        modifyEntries.updateFirst(
          (existingEntry) => existingEntry.sheetId === entry.sheetId,
          entry,
        );
      } else modifyEntries.push(entry);
    },
    [allEntries, modifyEntries],
  );

  const TableComponents: TableComponents<Row<Entry>> = useMemo(
    () => ({
      Scroller: RatingCalculatorScroller,
      Table: RatingCalculatorTable,
      TableHead: TableHead,
      TableRow: RatingCalculatorTableRow,
      TableBody: RatingCalculatorTableBody,
    }),
    [compactMode],
  );
  if (!sheets) return null;

  return (
    <div className="flex-container w-full pb-global">
      <div className="flex flex-col md:flex-row items-start gap-4 w-full">
        <Alert icon={false} severity="info" className="w-full px-4 py-2">
          <AlertTitle className="font-bold">Rating Breakdown</AlertTitle>
          <RatingCalculatorStatisticsTable />
        </Alert>

        <div className="flex flex-col gap-4 h-full self-stretch">
          <Alert
            icon={false}
            severity="info"
            className="w-full overflow-auto px-4 py-2"
            classes={{
              message: "w-full",
            }}
          >
            <AlertTitle className="font-bold">
              {allEntries?.length
                ? `Saved ${allEntries.length} records`
                : "Auto-save"}
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
              message: "overflow-unset",
            }}
          >
            <AlertTitle className="font-bold">Quick Actions</AlertTitle>
            <div className="flex flex-col items-start mt-2">
              <FormControlLabel
                control={
                  <Switch
                    checked={showOnlyB50}
                    onChange={() => setShowOnlyB50((prev) => !prev)}
                  />
                }
                label="Show only B50 entries"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={compactMode}
                    onChange={() => setCompactMode((prev) => !prev)}
                  />
                }
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
        <TableVirtuoso<Row<Entry>>
          useWindowScroll
          data={table.getRowModel().rows}
          className="w-full overflow-y-hidden"
          increaseViewportBy={2000}
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
                        "group bg-gray-900/5 transition",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:bg-gray-900/10 active:bg-gray-900/20 leading-tight py-4",
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <IconMdiArrowUp
                            className={clsx(
                              "ml-1 transition",
                              {
                                asc: "inline-flex rotate-0",
                                desc: "inline-flex rotate-180",
                                none: header.column.getCanSort()
                                  ? "inline-flex opacity-0 group-hover:opacity-70"
                                  : "hidden",
                              }[
                                (header.column.getIsSorted() as string) ||
                                  "none"
                              ],
                            )}
                          />
                        </div>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          }
          itemContent={(_, row) => (
            <RatingCalculatorTableRowContent row={row} />
          )}
        />

        {allEntries.length === 0 && (
          <div className="w-full text-sm py-8 px-4 text-center">No entries</div>
        )}
      </div>
    </div>
  );
};

const RatingCalculatorIncludedInCell: FC<{
  row: Row<Entry>;
}> = memo(({ row }) => {
  const includedIn = row.original.includedIn;
  if (!includedIn) return null;

  return (
    <div
      className={clsx(
        "tabular-nums w-12 leading-none py-1.5 rounded-full text-white text-center shadow select-none",
        includedIn === "b15" && "bg-amber-500",
        includedIn === "b35" && "bg-cyan-500",
      )}
    >
      {includedIn.toUpperCase()}
    </div>
  );
});
RatingCalculatorIncludedInCell.displayName =
  "memo(RatingCalculatorIncludedInCell)";

const RatingCalculatorAchievementRateCell: FC<{
  row: Row<Entry>;
}> = ({ row }) => (
  <span className="font-sans tabular-nums">
    {row.original.achievementRate.toFixed(4)}%
  </span>
);

const RatingCalculatorTable: FC<TableProps> = (props: TableProps) => (
  <Table
    {...props}
    size="small"
    className="rounded-lg w-full min-w-2xl"
    style={{ borderCollapse: "separate" }}
  />
);

const RatingCalculatorTableBody = forwardRef(
  (props: TableBodyProps, ref: ForwardedRef<HTMLTableSectionElement>) => (
    <TableBody {...props} ref={ref} />
  ),
);

const RatingCalculatorTableRow: FC<ItemProps<Row<Entry>>> = ({
  item,
  ...props
}) => (
  <TableRow
    {...props}
    className={clsx(
      "tabular-nums w-full",
      {
        b15: "bg-amber-200",
        b35: "bg-cyan-200",
        none: undefined,
      }[item.original.includedIn ?? "none"],
    )}
  />
);

const RatingCalculatorScroller = forwardRef(
  (props: ScrollerProps, ref: ForwardedRef<HTMLDivElement>) => (
    <TableContainer component={TransparentPaper} {...props} ref={ref} />
  ),
);

const RatingCalculatorRatingCell: FC<{
  row: Row<Entry>;
}> = ({ row }) => (
  <span className="font-sans tabular-nums">
    {row.original.rating ? row.original.rating.ratingAwardValue : "-"}
  </span>
);

const RatingCalculatorTableRowContent: FC<{
  row: Row<Entry>;
}> = ({ row }) => {
  return (
    <>
      {row.getVisibleCells().map((cell) => {
        return (
          <TableCell
            key={cell.id}
            {...(
              cell.column.columnDef.meta as {
                cellProps?: Record<string, unknown>;
              }
            )?.cellProps}
            style={{ width: cell.column.getSize() }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </>
  );
};

const RatingCalculatorStatisticsFactItem: FC<{
  size: "lg" | "md";
  label: string;
  value: number | string;
  className?: string;
}> = ({ size, label, value, className }) => (
  <div className={clsx("flex flex-col items-start gap-2", className)}>
    <div
      className={clsx(
        "font-sans tabular-nums !leading-none -mt-1.5 tracking-tight",
        {
          "text-4xl": size === "lg",
          "text-3xl": size === "md",
        },
      )}
    >
      {value}
    </div>
    <div className="text-sm font-semibold leading-none text-gray-600 -mt-1">
      {label}
    </div>
  </div>
);

export const RatingCalculatorStatisticsTable: FC = () => {
  const { b35Entries, b15Entries, statistics } = useRatingEntries();
  const {
    b15Average,
    b35Average,
    b15Min,
    b35Min,
    b15Max,
    b35Max,
    b15Sum,
    b35Sum,
    b50Sum,
  } = statistics;

  return (
    <div className="flex flex-col justify-center gap-4 text-black py-2">
      <RatingCalculatorStatisticsFactItem
        size="lg"
        label="Total"
        value={b50Sum}
      />

      <div className="flex flex-col items-start gap-2">
        <div className="flex items-baseline gap-1 leading-none">
          <span className="text-lg font-semibold">Best 15</span>
          <span className="text-sm text-gray-500">
            (Entries {b15Entries.length}/15)
          </span>
        </div>

        <div className="flex items-center w-full">
          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Subtotal"
            value={b15Sum}
            className="w-24"
          />

          <div className="h-12 w-px shrink-0 bg-gray-300 ml-2 mr-4" />

          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Min"
            value={b15Min.toFixed(0)}
            className="w-16"
          />
          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Avg"
            value={b15Average.toFixed(0)}
            className="w-16"
          />
          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Max"
            value={b15Max.toFixed(0)}
            className="w-16"
          />
        </div>
      </div>

      <div className="flex flex-col items-start gap-2">
        <div className="flex items-baseline gap-1 leading-none">
          <span className="text-lg font-semibold">Best 35</span>
          <span className="text-sm text-gray-500">
            (Entries {b35Entries.length}/35)
          </span>
        </div>

        <div className="flex items-center w-full">
          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Subtotal"
            value={b35Sum}
            className="w-24"
          />

          <div className="h-12 w-px shrink-0 bg-gray-300 ml-2 mr-4" />

          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Min"
            value={b35Min.toFixed(0)}
            className="w-16"
          />
          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Avg"
            value={b35Average.toFixed(0)}
            className="w-16"
          />
          <RatingCalculatorStatisticsFactItem
            size="md"
            label="Max"
            value={b35Max.toFixed(0)}
            className="w-16"
          />
        </div>
      </div>
    </div>
  );
};
