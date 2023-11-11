import { VersionEnum } from "@gekichumai/dxdata";
import {
  Alert,
  AlertTitle,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grow,
  IconButton,
  Paper,
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
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useList, useLocalStorage } from "react-use";
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
import {
  PlayEntry,
  RatingCalculatorAddEntryForm,
} from "../components/RatingCalculatorAddEntryForm";
import { SheetListItem } from "../components/SheetListItem";
import { ClearButton } from "../components/rating/io/ClearButton";
import { ExportMenu } from "../components/rating/io/ExportMenu";
import { ImportMenu } from "../components/rating/io/ImportMenu";
import { FlattenedSheet, useSheets } from "../songs";
import { Rating, calculateRating } from "../utils/rating";

export interface Entry {
  sheet: FlattenedSheet;
  rating: Rating;
  sheetId: string;
  achievementRate: number;
  includedIn: "b15" | "b35" | null;
}

const columnHelper = createColumnHelper<Entry>();

const RatingCalculatorRowActions: FC<{
  modifyEntries: ListActions<PlayEntry>;
  entry: PlayEntry;
}> = ({ modifyEntries, entry }) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = useCallback(() => {
    modifyEntries.filter(
      (existingEntry) => existingEntry.sheetId !== entry.sheetId,
    );
  }, []);

  return (
    <>
      <Dialog
        TransitionComponent={Grow}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      >
        <DialogTitle>Remove entry?</DialogTitle>
        <DialogContent className="min-w-[20rem]">
          <Alert severity="warning">
            <AlertTitle>Warning</AlertTitle>
            This will remove the entry permanently.
          </Alert>
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
            Clear
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
  const { data: sheets } = useSheets();
  const [localStorageEntries, setLocalStorageEntries] = useLocalStorage<
    PlayEntry[]
  >("rating-calculator-entries", []);
  const [entries, modifyEntries] = useList<PlayEntry>(localStorageEntries);

  const [sorting, setSorting] = useState<SortingState>([
    { id: "rating", desc: true },
  ]);

  useEffect(() => {
    setLocalStorageEntries(entries);
  }, [entries, setLocalStorageEntries]);

  const { allEntries, b15Entries, b35Entries } = useMemo(() => {
    const calculated = entries.flatMap((entry) => {
      const sheet = sheets?.find((sheet) => sheet.id === entry.sheetId);
      if (!sheet) {
        console.warn(`Chart ${entry.sheetId} not found`);
        return [];
      }

      return [
        {
          ...entry,
          sheet,
          rating: calculateRating(
            sheet.internalLevelValue,
            entry.achievementRate,
          ),
        },
      ];
    });

    const currentVersion = VersionEnum.FESTIVALPLUS;
    const best15OfCurrentVersionSheetIds = calculated
      .filter((entry) => entry.sheet.version === currentVersion)
      .sort((a, b) => b.rating.ratingAwardValue - a.rating.ratingAwardValue)
      .slice(0, 15)
      .map((entry) => entry.sheetId);

    const best35OfAllOtherVersionSheetIds = calculated
      .filter((entry) => entry.sheet.version !== currentVersion)
      .sort((a, b) => b.rating.ratingAwardValue - a.rating.ratingAwardValue)
      .slice(0, 35)
      .map((entry) => entry.sheetId);

    const calculatedEntries = calculated.map((entry) => ({
      ...entry,
      includedIn: best15OfCurrentVersionSheetIds.includes(entry.sheetId)
        ? ("b15" as const)
        : best35OfAllOtherVersionSheetIds.includes(entry.sheetId)
        ? ("b35" as const)
        : null,
    }));

    return {
      allEntries: calculatedEntries,
      b15Entries: calculatedEntries.filter(
        (entry) => entry.includedIn === "b15",
      ),
      b35Entries: calculatedEntries.filter(
        (entry) => entry.includedIn === "b35",
      ),
    };
  }, [entries, sheets]);

  const { b15Average, b35Average } = useMemo(() => {
    const b15Average =
      b15Entries.reduce(
        (acc, entry) => acc + entry.rating.ratingAwardValue,
        0,
      ) / b15Entries.length;

    const b35Average =
      b35Entries.reduce(
        (acc, entry) => acc + entry.rating.ratingAwardValue,
        0,
      ) / b35Entries.length;

    return {
      b15Average,
      b35Average,
    };
  }, [b15Entries, b35Entries]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "chart",
        header: "Chart",
        cell: ({ row }) => (
          <SheetListItem
            sheet={row.original.sheet}
            currentAchievementRate={row.original.achievementRate}
          />
        ),
        meta: {
          cellProps: {
            padding: "none",
          },
        },
        size: 500,
        minSize: 300,
      }),
      columnHelper.accessor("includedIn", {
        id: "includedIn",
        header: "Included in",
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
    [modifyEntries],
  );

  const table = useReactTable({
    data: allEntries,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const onSubmit = useCallback(
    (entry: PlayEntry) => {
      if (
        entries.some((existingEntry) => existingEntry.sheetId === entry.sheetId)
      ) {
        modifyEntries.updateFirst(
          (existingEntry) => existingEntry.sheetId === entry.sheetId,
          entry,
        );
      } else modifyEntries.push(entry);
    },
    [entries, modifyEntries],
  );

  const TableComponents: TableComponents<Row<Entry>> = useMemo(
    () => ({
      Scroller: RatingCalculatorScroller,
      Table: RatingCalculatorTable,
      TableHead: TableHead,
      TableRow: RatingCalculatorTableRow,
      TableBody: RatingCalculatorTableBody,
    }),
    [],
  );
  if (!sheets) return null;

  return (
    <div className="flex-container w-full pb-global">
      <div className="flex flex-col md:flex-row items-start gap-4">
        <Alert severity="info" className="w-full">
          <AlertTitle>Your current rating</AlertTitle>
          <Table className="-ml-2">
            <TableHead>
              <TableRow>
                <DenseTableCell className="w-sm">Item</DenseTableCell>
                <DenseTableCell>Matches</DenseTableCell>
                <DenseTableCell>Average</DenseTableCell>
                <DenseTableCell>Total</DenseTableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <DenseTableCell className="flex flex-col">
                  <div className="font-bold text-lg">B15</div>
                  <div className="text-gray-500">
                    Best 15 plays on songs released at current version (FESTiVAL
                    PLUS)
                  </div>
                </DenseTableCell>
                <DenseTableCell>{b15Entries.length}</DenseTableCell>
                <DenseTableCell>{b15Average.toFixed(2)}</DenseTableCell>

                <DenseTableCell>
                  {b15Entries.reduce(
                    (sum, entry) => sum + entry.rating.ratingAwardValue,
                    0,
                  )}
                </DenseTableCell>
              </TableRow>

              <TableRow>
                <DenseTableCell className="flex flex-col">
                  <div className="font-bold text-lg">B35</div>
                  <div className="text-gray-500">
                    Best 35 plays on all other songs except ones released at
                    current version (FESTiVAL PLUS)
                  </div>
                </DenseTableCell>
                <DenseTableCell>{b35Entries.length}</DenseTableCell>
                <DenseTableCell>{b35Average.toFixed(2)}</DenseTableCell>
                <DenseTableCell>
                  {b35Entries.reduce(
                    (sum, entry) => sum + entry.rating.ratingAwardValue,
                    0,
                  )}
                </DenseTableCell>
              </TableRow>

              <TableRow>
                <DenseTableCell colSpan={3}>
                  <span className="font-bold">Total</span>
                </DenseTableCell>
                <DenseTableCell>
                  {[...b15Entries, ...b35Entries].reduce(
                    (sum, entry) => sum + entry.rating.ratingAwardValue,
                    0,
                  )}
                </DenseTableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Alert>

        <div className="flex flex-col gap-4 h-full self-stretch">
          {/* <Alert severity="warning" className="w-full self-stretch h-full">
            <AlertTitle>Version mismatch</AlertTitle>
            The current version regarding B15 filtering is based on{" "}
            <strong>FESTiVAL</strong>, but the internal level data is from{" "}
            <strong>FESTiVAL PLUS</strong>, causing ratings to be inaccurate for
            the moment. When the corresponding cabinet (wink) updates to
            FESTiVAL PLUS, this site will be updated accordingly.
          </Alert> */}

          <Alert severity="info" className="w-full overflow-auto">
            <AlertTitle>
              {localStorageEntries?.length
                ? `Saved ${localStorageEntries.length} records`
                : "Auto-save"}
            </AlertTitle>
            Your entries will be saved automatically to your browser's local
            storage and will be restored when you return to this page.
            <div className="flex items-center gap-2 mt-2">
              <ImportMenu modifyEntries={modifyEntries} />

              <ExportMenu entries={entries} calculatedEntries={allEntries} />

              <div className="flex-1" />

              <ClearButton modifyEntries={modifyEntries} />
            </div>
          </Alert>
        </div>
      </div>

      <RatingCalculatorAddEntryForm onSubmit={onSubmit} />

      <div className="max-w-screen w-full overflow-x-auto">
        <TableVirtuoso<Row<Entry>>
          useWindowScroll
          data={table.getRowModel().rows}
          className="w-full overflow-y-hidden"
          increaseViewportBy={1000}
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
                          "cursor-pointer select-none hover:bg-gray-900/10 active:bg-gray-900/20",
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
          <TableCell colSpan={5}>No entries</TableCell>
        )}
      </div>
    </div>
  );
};

const RatingCalculatorIncludedInCell: FC<{
  row: Row<Entry>;
}> = ({ row }) => {
  const includedIn = row.original.includedIn;
  if (!includedIn) return null;

  return (
    <Chip
      label={includedIn.toUpperCase()}
      color={includedIn === "b15" ? "secondary" : "primary"}
      size="small"
      className="tabular-nums w-16 leading-none"
    />
  );
};

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
    className="rounded-lg w-full"
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
        b35: "bg-red-200",
        b15: "bg-green-200",
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
    {row.original.rating.ratingAwardValue}
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
