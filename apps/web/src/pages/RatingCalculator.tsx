import {
  Autocomplete,
  Button,
  Card,
  CardContent,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import {
  ComponentType,
  FC,
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
  cloneElement,
  forwardRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useList, useLocalStorage } from "react-use";
import { Virtuoso } from "react-virtuoso";
import IconMdiPlus from "~icons/mdi/plus";
import IconMdiTrashCan from "~icons/mdi/trash-can";
import {
  SheetListItem,
  SheetListItemContent,
} from "../components/SheetListItem";
import {
  FlattenedSheet,
  formatSheetToString,
  useSheets,
  useSheetsFuse,
} from "../songs";
import { calculateRating } from "../utils/rating";

export interface PlayEntry {
  sheetId: string;
  achievementRate: number;
}

const ListboxComponent = forwardRef<HTMLUListElement>(
  (
    { children, ...rest }: PropsWithChildren<HTMLAttributes<HTMLUListElement>>,
    ref,
  ) => {
    const data = children as ReactElement[];

    return (
      <ul
        ref={(reference) => {
          if (typeof ref === "function") {
            ref(reference);
          }
        }}
        {...rest}
      >
        <Virtuoso
          style={{ height: "20rem" }}
          data={data}
          itemContent={(index, child) => {
            return cloneElement(child, { index });
          }}
          increaseViewportBy={500}
          role="listbox"
        />
      </ul>
    );
  },
) as ComponentType<HTMLAttributes<HTMLElement>>;

const RatingCalculatorAddEntryForm: FC<{
  onSubmit: (entry: PlayEntry) => void;
}> = ({ onSubmit }) => {
  const { data: sheets } = useSheets();
  const fuseInstance = useSheetsFuse();
  const [selectedSheet, setSelectedSheet] = useState<FlattenedSheet | null>(
    null,
  );
  const [achievementRate, setAchievementRate] = useState<string>("");
  const [achievementRateError, setAchievementRateError] = useState<
    string | null
  >(null);
  const resetForm = useCallback(() => {
    setSelectedSheet(null);
    setAchievementRate("");
    setAchievementRateError(null);
  }, []);

  if (!sheets) return null;

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center justify-center gap-2">
        <div className="chunks-horizontal-2 items-start">
          <Autocomplete
            fullWidth
            options={sheets}
            getOptionLabel={(sheet) => formatSheetToString(sheet)}
            renderInput={(params) => (
              <TextField {...params} label="Sheet" variant="outlined" />
            )}
            filterOptions={(_, { inputValue }) => {
              if (!inputValue) return sheets;
              const results = fuseInstance.search(inputValue);
              return results.map((result) => result.item);
            }}
            renderOption={(attributes, option) => (
              <li {...attributes}>
                <SheetListItemContent sheet={option} />
              </li>
            )}
            ListboxComponent={ListboxComponent}
            itemID="id"
            value={selectedSheet}
            onChange={(_, value) => {
              console.log(value);
              setSelectedSheet(value);
            }}
            isOptionEqualToValue={(option, value) => option.id === value.id}
          />

          <TextField
            className="md:basis-24rem"
            label="Achievement Rate"
            variant="outlined"
            value={achievementRate}
            onChange={(e) => setAchievementRate(e.target.value)}
            onBlur={() => {
              if (!achievementRate) {
                setAchievementRateError("Required");
              }
              try {
                const parsed = parseFloat(achievementRate!);
                if (isNaN(parsed)) {
                  setAchievementRateError("Invalid number");
                } else if (parsed < 0 || parsed > 101) {
                  setAchievementRateError("Must be between 0% and 101%");
                } else {
                  setAchievementRateError(null);
                }
              } catch (e) {
                setAchievementRateError(
                  `Invalid number: ${(e as Error).message}`,
                );
              }
            }}
            fullWidth
            error={!!achievementRateError}
            helperText={achievementRateError}
            InputProps={{
              endAdornment: "%",
              type: "number",
            }}
          />
        </div>
        <div className="chunks-horizontal-2">
          <div className="w-full flex justify-start">
            {selectedSheet && <SheetListItemContent sheet={selectedSheet} />}
          </div>

          <div className="w-full flex justify-end">
            <Button
              variant="contained"
              disabled={
                !selectedSheet ||
                !!achievementRateError ||
                achievementRate === ""
              }
              onClick={() => {
                onSubmit({
                  sheetId: selectedSheet!.id,
                  achievementRate: parseFloat(achievementRate),
                });
                resetForm();
              }}
              startIcon={<IconMdiPlus fontSize="inherit" />}
            >
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const RatingCalculator = () => {
  const { data: sheets } = useSheets();
  const [localStorageEntries, setLocalStorageEntries] = useLocalStorage<
    PlayEntry[]
  >("rating-calculator-entries", []);
  const [entries, modifyEntries] = useList<PlayEntry>(localStorageEntries);

  useEffect(() => {
    setLocalStorageEntries(entries);
  }, [entries, setLocalStorageEntries]);

  if (!sheets) return null;

  const calculatedEntries = entries.map((entry) => {
    const sheet = sheets.find((sheet) => sheet.id === entry.sheetId);
    if (!sheet) {
      throw new Error(`Sheet ${entry.sheetId} not found`);
    }

    return {
      ...entry,
      sheet,
      rating: calculateRating(sheet.internalLevelValue, entry.achievementRate),
    };
  });

  return (
    <div className="flex-container w-full">
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

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Sheet</TableCell>
            <TableCell>Achievement Rate</TableCell>
            <TableCell>Rating</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody className="tabular-nums">
          {calculatedEntries.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>No entries</TableCell>
            </TableRow>
          )}
          {calculatedEntries.map((entry) => (
            <TableRow key={entry.sheetId}>
              <TableCell>
                <SheetListItem sheet={entry.sheet} />
              </TableCell>

              <TableCell>{entry.achievementRate.toFixed(4)}%</TableCell>

              <TableCell>{entry.rating.ratingAwardValue}</TableCell>

              <TableCell>
                <IconButton
                  onClick={() => {
                    modifyEntries.removeAt(
                      entries.findIndex(
                        (existingEntry) =>
                          existingEntry.sheetId === entry.sheetId,
                      ),
                    );
                  }}
                >
                  <IconMdiTrashCan />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
