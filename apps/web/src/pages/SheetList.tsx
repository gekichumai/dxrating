import {
  Alert,
  Button,
  FormControlLabel,
  Switch,
  TextField,
} from "@mui/material";
import { FC, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import IconMdiOcr from "~icons/mdi/ocr";
import { SheetListContainer } from "../components/SheetListContainer";
import { useAppContextDXDataVersion } from "../models/context/useAppContext";
import { useFilteredSheets, useSheets } from "../songs";
import { DXRatingPlugin } from "../utils/capacitor/plugin/wrap";
import { isBuildPlatformApp } from "../utils/env";

export const SheetList: FC = () => {
  const { t } = useTranslation(["sheet"]);
  const appVersion = useAppContextDXDataVersion();
  const { data: sheets } = useSheets();
  const [search, setSearch] = useState<string>("");
  const { results, elapsed } = useFilteredSheets(search);
  const [showOnlyCurrentVersion, setShowOnlyCurrentVersion] =
    useState<boolean>(false);

  const filteredResults = useMemo(() => {
    if (showOnlyCurrentVersion) {
      return results
        .filter((sheet) => sheet.version === appVersion)
        .sort((a, b) => b.internalLevelValue - a.internalLevelValue);
    }
    return results;
  }, [results, showOnlyCurrentVersion, appVersion]);

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

      <FormControlLabel
        control={
          <Switch
            checked={showOnlyCurrentVersion}
            onChange={(e) => setShowOnlyCurrentVersion(e.target.checked)}
          />
        }
        label={t("sheet:filter-current-version", { version: appVersion })}
      />

      <Alert severity="info" className="text-sm !rounded-full shadow-lg">
        {t("sheet:search-summary", {
          found: filteredResults.length,
          total: sheets?.length,
          elapsed: elapsed.toFixed(1),
        })}
      </Alert>

      <SheetListContainer sheets={filteredResults} />
    </div>
  );
};
