import {
  Alert,
  AlertTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { useEffect, useMemo } from "react";
import { useList, useLocalStorage } from "react-use";
import IconMdiTrashCan from "~icons/mdi/trash-can";
import {
  PlayEntry,
  RatingCalculatorAddEntryForm,
} from "../components/RatingCalculatorAddEntryForm";
import { SheetListItem } from "../components/SheetListItem";
import { useSheets } from "../songs";
import { calculateRating } from "../utils/rating";

export const RatingCalculator = () => {
  const { data: sheets } = useSheets();
  const [localStorageEntries, setLocalStorageEntries] = useLocalStorage<
    PlayEntry[]
  >("rating-calculator-entries", []);
  const [entries, modifyEntries] = useList<PlayEntry>(localStorageEntries);

  useEffect(() => {
    setLocalStorageEntries(entries);
  }, [entries, setLocalStorageEntries]);

  const calculatedEntries = useMemo(
    () =>
      entries.map((entry) => {
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
      }),
    [entries],
  );

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

      <Alert severity="info" className="w-full">
        <AlertTitle>
          {localStorageEntries?.length
            ? `Saved ${localStorageEntries.length} records`
            : "Auto-save"}
        </AlertTitle>
        Your entries will be saved automatically to your browser's local storage
        and will be restored when you return to this page.
      </Alert>

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
              <TableCell padding="none">
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
