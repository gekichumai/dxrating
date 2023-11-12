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
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso } from "react-virtuoso";
import IconMdiReplace from "~icons/mdi/find-replace";
import IconMdiPlus from "~icons/mdi/plus";
import { useRatingCalculatorContext } from "../models/RatingCalculatorContext";
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
}> = memo(({ onSubmit }) => {
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

  const { entries } = useRatingCalculatorContext();
  const found = useMemo(() => {
    return entries?.find((entry) => entry.sheetId === selectedSheet?.id);
  }, [entries, selectedSheet]);

  const replacing = useMemo(() => {
    try {
      if (found && achievementRate) {
        const newRating = calculateRating(
          selectedSheet!.internalLevelValue,
          parseFloat(achievementRate),
        );
        const currentRating = calculateRating(
          selectedSheet!.internalLevelValue,
          found.achievementRate,
        );
        const diff =
          newRating.ratingAwardValue - currentRating.ratingAwardValue;
        if (diff <= 0) return null;
        return {
          entry: found,
          newRating,
          currentRating,
          diff,
        };
      }
    } catch (e) {
      // ignore
    }
    return null;
  }, [selectedSheet, achievementRate, found]);

  const validate = useCallback((value: string) => {
    if (!value) {
      setAchievementRateError("Required");
    }
    try {
      const parsed = parseFloat(value!);
      if (isNaN(parsed)) {
        setAchievementRateError("Invalid number");
      } else if (parsed < 0 || parsed > 101) {
        setAchievementRateError("Must be between 0% and 101%");
      } else {
        setAchievementRateError(null);
      }
    } catch (e) {
      setAchievementRateError(`Invalid number: ${(e as Error).message}`);
    }
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
              <TextField {...params} label="Chart" variant="outlined" />
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
            onChange={(e) => {
              setAchievementRate(e.target.value);
              validate(e.target.value);
            }}
            onBlur={() => validate(achievementRate)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit({
                  sheetId: selectedSheet!.id,
                  achievementRate: parseFloat(achievementRate),
                });
                resetForm();
              }
            }}
            onWheel={(e) => {
              const target = e.target as HTMLInputElement;
              // Prevent the input value change
              target.blur();

              // Prevent the page/container scrolling
              e.stopPropagation();

              // Refocus immediately, on the next tick (after the current function is done)
              setTimeout(() => {
                target.focus();
              }, 0);
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

          <div className="w-full flex justify-end items-center gap-4">
            {selectedSheet && (
              <div className="flex flex-col items-start gap-0.5">
                {found && (
                  <div>
                    Current Rating:{" "}
                    {
                      calculateRating(
                        selectedSheet.internalLevelValue,
                        found.achievementRate,
                      ).ratingAwardValue
                    }
                  </div>
                )}
                {replacing ? (
                  <div className="flex flex-col items-start font-bold">
                    <div>
                      New Rating: {replacing.newRating.ratingAwardValue}
                    </div>
                    <div className="text-sm bg-amber-3 b-2 border-solid border-amber-4 text-black px-1.5 rounded inline-flex">
                      +{replacing.diff}
                    </div>
                  </div>
                ) : (
                  achievementRate && (
                    <div className="flex flex-col items-center gap-1">
                      Rating:{" "}
                      {
                        calculateRating(
                          selectedSheet.internalLevelValue,
                          parseFloat(achievementRate),
                        ).ratingAwardValue
                      }
                    </div>
                  )
                )}
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
              startIcon={
                replacing ? (
                  <IconMdiReplace fontSize="inherit" />
                ) : (
                  <IconMdiPlus fontSize="inherit" />
                )
              }
            >
              {replacing ? `Replace (+${replacing.diff})` : "Add"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
