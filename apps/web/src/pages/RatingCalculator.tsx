import { VersionEnum } from "@gekichumai/dxdata";
import {
  Alert,
  AlertTitle,
  Button,
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
  SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import clsx from "clsx";
import { FC, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useList, useLocalStorage } from "react-use";
import { ListActions } from "react-use/lib/useList";
import IconMdiTrashCan from "~icons/mdi/trash-can";
import {
  PlayEntry,
  RatingCalculatorAddEntryForm,
} from "../components/RatingCalculatorAddEntryForm";
import { SheetListItem } from "../components/SheetListItem";
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
  padding: theme.spacing(0.5, 1),
}));

export const RatingCalculator = () => {
  const { data: sheets } = useSheets();
  const [localStorageEntries, setLocalStorageEntries] = useLocalStorage<
    PlayEntry[]
  >("rating-calculator-entries", []);
  const [entries, modifyEntries] = useList<PlayEntry>(localStorageEntries);

  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    setLocalStorageEntries(entries);
  }, [entries, setLocalStorageEntries]);

  const calculatedEntries = useMemo(() => {
    const calculated = entries.map((entry) => {
      const sheet = sheets?.find((sheet) => sheet.id === entry.sheetId);
      if (!sheet) {
        throw new Error(`Sheet ${entry.sheetId} not found`);
      }

      return {
        ...entry,
        sheet,
        rating: calculateRating(
          sheet.internalLevelValue,
          entry.achievementRate,
        ),
      };
    });

    const currentVersion = VersionEnum.FESTIVAL;
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

    return calculated.map((entry) => ({
      ...entry,
      includedIn: best15OfCurrentVersionSheetIds.includes(entry.sheetId)
        ? ("b15" as const)
        : best35OfAllOtherVersionSheetIds.includes(entry.sheetId)
        ? ("b35" as const)
        : null,
    }));
  }, [entries, sheets]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "sheet",
        header: "Sheet",
        cell: ({ row }) => <SheetListItem sheet={row.original.sheet} />,
        meta: {
          cellProps: {
            padding: "none",
          },
        },
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
        id: "rating.ratingAwardValue",
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
    data: calculatedEntries,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!sheets) return null;

  return (
    <div className="flex-container w-full pb-global">
      <RatingCalculatorAddEntryForm
        onSubmit={(entry) => {
          if (
            entries.some(
              (existingEntry) => existingEntry.sheetId === entry.sheetId,
            )
          ) {
            modifyEntries.updateFirst(
              (existingEntry) => existingEntry.sheetId === entry.sheetId,
              entry,
            );
          } else modifyEntries.push(entry);
        }}
      />

      <div className="flex flex-col md:flex-row items-start gap-4">
        <Alert severity="info" className="w-full">
          <AlertTitle>Your current rating</AlertTitle>
          <Table className="-ml-2">
            <TableHead>
              <TableRow>
                <DenseTableCell className="w-sm">Item</DenseTableCell>
                <DenseTableCell>Value</DenseTableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <DenseTableCell className="flex flex-col">
                  <div className="font-bold text-lg">B15</div>
                  <div className="text-gray-500">
                    Best 15 of the current version (FESTiVAL)
                  </div>
                </DenseTableCell>
                <DenseTableCell>
                  {calculatedEntries
                    .filter((entry) => entry.includedIn === "b15")
                    .reduce(
                      (sum, entry) => sum + entry.rating.ratingAwardValue,
                      0,
                    )}
                </DenseTableCell>
              </TableRow>

              <TableRow>
                <DenseTableCell className="flex flex-col">
                  <div className="font-bold text-lg">B35</div>
                  <div className="text-gray-500">
                    Best 35 of plays on all other maps except the current
                    version (FESTiVAL)
                  </div>
                </DenseTableCell>
                <DenseTableCell>
                  {calculatedEntries
                    .filter((entry) => entry.includedIn === "b35")
                    .reduce(
                      (sum, entry) => sum + entry.rating.ratingAwardValue,
                      0,
                    )}
                </DenseTableCell>
              </TableRow>

              <TableRow>
                <DenseTableCell>
                  <span className="font-bold">Total</span>
                </DenseTableCell>
                <DenseTableCell>
                  {calculatedEntries
                    .filter((entry) => entry.includedIn)
                    .reduce(
                      (sum, entry) => sum + entry.rating.ratingAwardValue,
                      0,
                    )}
                </DenseTableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Alert>

        <div className="flex flex-col gap-4">
          <Alert severity="info" className="w-full">
            <AlertTitle>
              {localStorageEntries?.length
                ? `Saved ${localStorageEntries.length} records`
                : "Auto-save"}
            </AlertTitle>
            Your entries will be saved automatically to your browser's local
            storage and will be restored when you return to this page.
          </Alert>

          <Alert severity="info" className="w-full">
            <AlertTitle>Import/Export</AlertTitle>

            <div className="flex items-center gap-2">
              <Button
                variant="outlined"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "application/json";
                  input.onchange = (event) => {
                    const element = event.target as HTMLInputElement;
                    if (!element) return;

                    const file = element?.files ? element?.files[0] : undefined;
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const data = event.target?.result;
                      if (!data) return;
                      if (typeof data !== "string") return;

                      const entries = JSON.parse(data);
                      // basic validation
                      if (
                        !Array.isArray(entries) ||
                        !entries.length ||
                        !entries[0].sheetId ||
                        !entries[0].achievementRate
                      ) {
                        toast.error("Invalid file format");
                        return;
                      }

                      modifyEntries.set(entries);

                      toast.success("Imported " + entries.length + " entries");
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}
              >
                Import
              </Button>

              <Button
                variant="outlined"
                onClick={() => {
                  const data = JSON.stringify(entries);
                  const blob = new Blob([data], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const name = `dxrating.imgg.dev.export${Date.now()}.json`;
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = name;
                  a.click();
                  URL.revokeObjectURL(url);

                  toast.success("Exported as " + name);
                }}
              >
                Export
              </Button>
            </div>
          </Alert>
        </div>
      </div>

      <Table>
        <TableHead>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableCell key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <div
                        {...{
                          className: header.column.getCanSort()
                            ? "cursor-pointer select-none"
                            : "",
                          onClick: header.column.getToggleSortingHandler(),
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {{
                          asc: " 🔼",
                          desc: " 🔽",
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableHead>
        <TableBody className="tabular-nums">
          {table.getRowModel().rows.map((row) => {
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
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {calculatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>No entries</TableCell>
            </TableRow>
          )}
          {calculatedEntries.length > 0 && (
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell>
                {calculatedEntries.reduce(
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
  );
};
