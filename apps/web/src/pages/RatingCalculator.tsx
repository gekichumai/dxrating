import { VersionEnum } from "@gekichumai/dxdata";
import {
  Alert,
  AlertTitle,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
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
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { useList, useLocalStorage } from "react-use";
import { ListActions } from "react-use/lib/useList";
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
import { RenderMenu } from "../components/rating/io/RenderMenu";
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
  return (
    <IconButton
      onClick={() => {
        modifyEntries.filter(
          (existingEntry) => existingEntry.sheetId !== entry.sheetId,
        );
      }}
    >
      <IconMdiTrashCan />
    </IconButton>
  );
};

const DenseTableCell = styled(TableCell)(({ theme }) => ({
  padding: theme.spacing(0.75 + 0.0625, 1),
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
    const calculated = entries.map((entry) => {
      const sheet = sheets?.find((sheet) => sheet.id === entry.sheetId);
      if (!sheet) throw new Error(`Chart ${entry.sheetId} not found`);

      return {
        ...entry,
        sheet,
        rating: calculateRating(
          sheet.internalLevelValue,
          entry.achievementRate,
        ),
      };
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
        size: 400,
        minSize: 200,
      }),
      columnHelper.accessor("includedIn", {
        id: "includedIn",
        header: "Included in",
        cell: ({ row }) => {
          const includedIn = row.original.includedIn;
          if (!includedIn) return null;

          return (
            <Chip
              label={includedIn.toUpperCase()}
              color={includedIn === "b15" ? "secondary" : "primary"}
              size="small"
              className="tabular-nums w-16"
            />
          );
        },
      }),
      columnHelper.accessor("achievementRate", {
        id: "achievementRate",
        header: "Achievement Rate",
        cell: ({ row }) => `${row.original.achievementRate.toFixed(4)}%`,
      }),
      columnHelper.accessor("rating.ratingAwardValue", {
        id: "rating",
        header: "Rating",
        cell: ({ row }) => row.original.rating.ratingAwardValue,
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

          <Alert severity="info" className="w-full">
            <AlertTitle>
              {localStorageEntries?.length
                ? `Saved ${localStorageEntries.length} records`
                : "Auto-save"}
            </AlertTitle>
            Your entries will be saved automatically to your browser's local
            storage and will be restored when you return to this page.
            <div className="flex items-center gap-2 mt-2">
              <ImportMenu modifyEntries={modifyEntries} />

              <ExportMenu entries={entries} />

              <RenderMenu calculatedEntries={allEntries} />

              <div className="flex-1" />

              <ClearButton modifyEntries={modifyEntries} />
            </div>
          </Alert>
        </div>
      </div>

      <RatingCalculatorAddEntryForm onSubmit={onSubmit} />

      <div className="max-w-screen w-full overflow-x-auto">
        <Table className="rounded-lg w-full">
          <TableHead>
            {table.getHeaderGroups().map((headerGroup) => (
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
                              "inline-flex ml-1 transition",
                              {
                                asc: "rotate-0",
                                desc: "rotate-180",
                                none: header.column.getCanSort()
                                  ? "opacity-0 group-hover:opacity-70"
                                  : "opacity-0",
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
            ))}
          </TableHead>
          <TableBody className="tabular-nums">
            {table.getRowModel().rows.map((row) => (
              <RatingCalculatorTableRow row={row} key={row.id} />
            ))}
            {allEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>No entries</TableCell>
              </TableRow>
            )}
            {allEntries.length > 0 && (
              <TableRow className="bg-gray-900">
                <TableCell colSpan={3} className="!text-white !font-bold !pl-5">
                  Total
                </TableCell>
                <TableCell className="!text-white !font-bold">
                  {allEntries.reduce(
                    (acc, entry) => acc + entry.rating.ratingAwardValue,
                    0,
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const RatingCalculatorTableRow: FC<{
  row: Row<Entry>;
}> = ({ row }) => {
  return (
    <TableRow
      key={row.id}
      className={clsx(
        {
          b35: "bg-red-200",
          b15: "bg-green-200",
          none: undefined,
        }[row.original.includedIn ?? "none"],
      )}
    >
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
    </TableRow>
  );
};
