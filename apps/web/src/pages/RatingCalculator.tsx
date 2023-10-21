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
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
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
import { FC, useCallback, useEffect, useId, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useList, useLocalStorage } from "react-use";
import { ListActions } from "react-use/lib/useList";
import IconMdiArrowUp from "~icons/mdi/arrow-up";
import IconMdiFile from "~icons/mdi/file";
import IconMdiTrashCan from "~icons/mdi/trash-can";
import {
  PlayEntry,
  RatingCalculatorAddEntryForm,
} from "../components/RatingCalculatorAddEntryForm";
import { SheetListItem } from "../components/SheetListItem";
import { FlattenedSheet, useSheets } from "../songs";
import { Rating, calculateRating } from "../utils/rating";
import { ImportFromAquaSQLiteListItem } from "./ImportFromAquaSQLiteButton";

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

const ClearButton: FC<{
  modifyEntries: ListActions<PlayEntry>;
}> = ({ modifyEntries }) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Dialog
        TransitionComponent={Grow}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      >
        <DialogTitle>Clear all entries?</DialogTitle>
        <DialogContent className="w-96">
          <Alert severity="warning">
            <AlertTitle>Warning</AlertTitle>
            This will clear all entries.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>

          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDialogOpen(false);
              modifyEntries.clear();
            }}
          >
            Clear
          </Button>
        </DialogActions>
      </Dialog>

      <Button
        color="error"
        variant="outlined"
        onClick={() => {
          setDialogOpen(true);
        }}
      >
        Clear...
      </Button>
    </>
  );
};

const ImportFromJSONButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>;
  onClose: () => void;
}> = ({ modifyEntries, onClose }) => {
  return (
    <MenuItem
      onClick={() => {
        onClose();

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
      <ListItemIcon>
        <IconMdiFile />
      </ListItemIcon>
      <ListItemText>Import from JSON...</ListItemText>
    </MenuItem>
  );
};

const ExportToJSONButton: FC<{
  entries: PlayEntry[];
}> = ({ entries }) => {
  return (
    <Button
      variant="outlined"
      onClick={() => {
        const data = JSON.stringify(entries);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const name = `dxrating.imgg.dev.export-${new Date().toISOString()}.json`;
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
  );
};

const ImportMenu: FC<{
  modifyEntries: ListActions<PlayEntry>;
}> = ({ modifyEntries }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const id = useId();

  return (
    <>
      <Button
        id={`button-${id}`}
        aria-controls={open ? `menu-${id}` : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        onClick={handleClick}
        variant="outlined"
      >
        Import...
      </Button>

      <Menu
        id={`menu-${id}`}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": `button-${id}`,
        }}
      >
        <ImportFromAquaSQLiteListItem
          modifyEntries={modifyEntries}
          onClose={handleClose}
        />
        <ImportFromJSONButtonListItem
          modifyEntries={modifyEntries}
          onClose={handleClose}
        />
      </Menu>
    </>
  );
};

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
      if (!sheet) throw new Error(`Sheet ${entry.sheetId} not found`);

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

        <div className="flex flex-col gap-4 h-full self-stretch">
          <Alert severity="warning" className="w-full self-stretch h-full">
            <AlertTitle>Version mismatch</AlertTitle>
            The current version regarding B15 filtering is based on{" "}
            <strong>FESTiVAL</strong>, but the internal level data is from{" "}
            <strong>FESTiVAL PLUS</strong>, causing ratings to be inaccurate for
            the moment. When the corresponding cabinet (wink) updates to
            FESTiVAL PLUS, this site will be updated accordingly.
          </Alert>

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

              <ExportToJSONButton entries={entries} />

              <div className="flex-1" />

              <ClearButton modifyEntries={modifyEntries} />
            </div>
          </Alert>
        </div>
      </div>

      <RatingCalculatorAddEntryForm onSubmit={onSubmit} />

      <Table className="rounded-lg overflow-hidden">
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
                              (header.column.getIsSorted() as string) || "none"
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
          {calculatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>No entries</TableCell>
            </TableRow>
          )}
          {calculatedEntries.length > 0 && (
            <TableRow className="bg-gray-900">
              <TableCell colSpan={3} className="!text-white !font-bold !pl-5">
                Total
              </TableCell>
              <TableCell className="!text-white !font-bold">
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
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
};
