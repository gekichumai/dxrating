import { Alert, Button, TextField } from "@mui/material";
import { FC, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import IconMdiOcr from "~icons/mdi/ocr";
import { SheetListContainer } from "../components/SheetListContainer";
import {
  SheetSortFilter,
  SheetSortFilterForm,
} from "../components/sheet/SheetSortFilter";
import { FlattenedSheet, useFilteredSheets, useSheets } from "../songs";
import { DXRatingPlugin } from "../utils/capacitor/plugin/wrap";
import { isBuildPlatformApp } from "../utils/env";

export const SheetList: FC = () => {
  const { t } = useTranslation(["sheet"]);
  const { data: sheets } = useSheets();
  const [search, setSearch] = useState<string>("");
  const { results, elapsed: searchElapsed } = useFilteredSheets(search);
  const [sortFilterOptions, setSortFilterOptions] =
    useState<SheetSortFilterForm | null>(null);

  const { filteredResults, elapsed: filteringElapsed } = useMemo(() => {
    const startTime = performance.now();
    let filteredResults: FlattenedSheet[] = results;
    if (sortFilterOptions) {
      filteredResults = results.filter((sheet) => {
        if (sortFilterOptions.internalLevelValue) {
          const { gte, lte } = sortFilterOptions.internalLevelValue;
          return (
            sheet.internalLevelValue >= gte && sheet.internalLevelValue <= lte
          );
        }
        return true;
      });
    }
    return {
      filteredResults,
      elapsed: performance.now() - startTime,
    };
  }, [results, sortFilterOptions]);

  return (
    <div className="flex-container pb-global">
      <TextField
        label={t("sheet:search")}
        variant="outlined"
        value={search}
        fullWidth
        onChange={(e) => setSearch(e.target.value)}
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
