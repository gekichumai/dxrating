import { Alert, Button, TextField } from "@mui/material";
import { FC, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import IconMdiOcr from "~icons/mdi/ocr";
import { SheetListContainer } from "../components/SheetListContainer";
import {
  SheetSortFilter,
  SheetSortFilterForm,
} from "../components/sheet/SheetSortFilter";
import {
  SheetDetailsContext,
  SheetDetailsContextProvider,
} from "../models/context/SheetDetailsContext";
import { FlattenedSheet, useFilteredSheets, useSheets } from "../songs";
import { DXRatingPlugin } from "../utils/capacitor/plugin/wrap";
import { isBuildPlatformApp } from "../utils/env";

const chainEvery =
  <T,>(...fns: ((arg: T) => boolean | undefined)[]) =>
  (arg: T) =>
    fns.every((fn) => fn(arg));

const SheetListInner: FC = () => {
  const { t } = useTranslation(["sheet"]);
  const { data: sheets } = useSheets();
  const { setQueryActive } = useContext(SheetDetailsContext);
  const [query, setQuery] = useState("");
  const { results, elapsed: searchElapsed } = useFilteredSheets(query);
  const [sortFilterOptions, setSortFilterOptions] =
    useState<SheetSortFilterForm | null>(null);

  const { filteredResults, elapsed: filteringElapsed } = useMemo(() => {
    const startTime = performance.now();
    let sortFilteredResults: FlattenedSheet[] = results;
    if (sortFilterOptions) {
      sortFilteredResults = results.filter((sheet) => {
        return chainEvery<FlattenedSheet>(
          (v) => {
            if (sortFilterOptions.filters.internalLevelValue) {
              const { min, max } = sortFilterOptions.filters.internalLevelValue;
              return v.internalLevelValue >= min && v.internalLevelValue <= max;
            }
          },
          (v) => {
            if (sortFilterOptions.filters.versions) {
              const versions = sortFilterOptions.filters.versions;
              return versions.includes(v.version);
            }
          },
        )(sheet);
      });
      if (!query) {
        sortFilteredResults.sort((a, b) => {
          return sortFilterOptions.sorts.reduce((acc, sort) => {
            if (acc !== 0) {
              return acc;
            }
            const aValue = a[sort.descriptor];
            const bValue = b[sort.descriptor];
            if (aValue == null || bValue == null) {
              // ==: null or undefined
              return 0;
            }
            if (aValue < bValue) {
              return sort.direction === "asc" ? -1 : 1;
            }
            if (aValue > bValue) {
              return sort.direction === "asc" ? 1 : -1;
            }
            return 0;
          }, 0);
        });
      }
    }
    return {
      filteredResults: sortFilteredResults,
      elapsed: performance.now() - startTime,
    };
  }, [results, sortFilterOptions, query]);

  return (
    <div className="flex-container pb-global">
      <TextField
        label={t("sheet:search")}
        variant="outlined"
        value={query}
        fullWidth
        onChange={(e) => {
          setQuery(e.target.value);
          setQueryActive(!!e.target.value);
        }}
      />

      {isBuildPlatformApp && (
        <Button
          onClick={() => DXRatingPlugin.launchInstantOCR()}
          className="mt-2 rounded-full text-white"
          variant="contained"
          startIcon={<IconMdiOcr />}
        >
          {t("sheet:ocr")}
        </Button>
      )}

      <SheetSortFilter onChange={(v) => setSortFilterOptions(v)} />

      <Alert severity="info" className="text-sm !rounded-full shadow-lg">
        {t("sheet:search-summary", {
          found: filteredResults.length,
          total: sheets?.length,
          elapsed: (searchElapsed + filteringElapsed).toFixed(1),
        })}
      </Alert>

      <SheetListContainer sheets={filteredResults} />
    </div>
  );
};

export const SheetList: FC = () => {
  return (
    <SheetDetailsContextProvider>
      <SheetListInner />
    </SheetDetailsContextProvider>
  );
};
