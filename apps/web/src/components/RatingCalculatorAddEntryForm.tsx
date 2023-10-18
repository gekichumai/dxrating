import {
  Autocomplete,
  Button,
  Card,
  CardContent,
  TextField,
} from "@mui/material";
import clsx from "clsx";
import {
  ComponentType,
  FC,
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
  cloneElement,
  forwardRef,
  useCallback,
  useRef,
  useState,
} from "react";
import { Virtuoso } from "react-virtuoso";
import IconMdiPlus from "~icons/mdi/plus";
import {
  FlattenedSheet,
  formatSheetToString,
  useSheets,
  useSheetsFuse,
} from "../songs";
import { calculateRating } from "../utils/rating";
import { SheetListItemContent } from "./SheetListItem";

export interface PlayEntry {
  sheetId: string;
  achievementRate: number;
}

const ListboxComponent = forwardRef<HTMLElement>(
  (
    { children, ...rest }: PropsWithChildren<HTMLAttributes<HTMLUListElement>>,
    ref,
  ) => {
    const data = children as ReactElement[];

    return (
      <ul {...rest} className={clsx("!py-0", rest.className)}>
        <Virtuoso
          scrollerRef={ref as (ref: HTMLElement | Window | null) => void}
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

export const RatingCalculatorAddEntryForm: FC<{
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
  const autocompleteRef = useRef<unknown>(null);
  const resetForm = useCallback(() => {
    setSelectedSheet(null);
    setAchievementRate("");
    setAchievementRateError(null);
    const autocomplete = autocompleteRef.current as HTMLDivElement;
    autocomplete.focus();
  }, []);

  if (!sheets) return null;

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center justify-center gap-2">
        <div className="chunks-horizontal-2 items-start">
          <Autocomplete
            ref={autocompleteRef}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit({
                  sheetId: selectedSheet!.id,
                  achievementRate: parseFloat(achievementRate),
                });
                resetForm();
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

          <div className="w-full flex justify-end items-center gap-2">
            {selectedSheet && achievementRate && (
              <div>
                Rating:{" "}
                {
                  calculateRating(
                    selectedSheet.internalLevelValue,
                    parseFloat(achievementRate),
                  ).ratingAwardValue
                }
              </div>
            )}

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
