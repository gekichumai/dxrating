import {
  Alert,
  Button,
  FormControlLabel,
  Switch,
  TextField,
} from "@mui/material";
import { FC, useMemo, useState } from "react";
import IconMdiOcr from "~icons/mdi/ocr";
import { SheetListContainer } from "../components/SheetListContainer";
import { useAppContextDXDataVersion } from "../models/context/useAppContext";
import { useFilteredSheets, useSheets } from "../songs";
import { DXRatingPlugin } from "../utils/capacitor/plugin/wrap";

export const SheetList: FC = () => {
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
        label="Search"
        variant="outlined"
        value={search}
        fullWidth
        onChange={(e) => setSearch(e.target.value)}
      />

      {
        <Button
          onClick={() => DXRatingPlugin.launchInstantOCR()}
          className="mt-2 rounded-full text-white"
          variant="contained"
          startIcon={<IconMdiOcr />}
        >
          Launch OCR
        </Button>
      }

      <FormControlLabel
        control={
          <Switch
            checked={showOnlyCurrentVersion}
            onChange={(e) => setShowOnlyCurrentVersion(e.target.checked)}
          />
        }
        label={`Filter Current B15: Show only ${appVersion} charts`}
      />

      <Alert severity="info" className="text-sm !rounded-full shadow-lg">
        Found {filteredResults.length} charts out of {sheets?.length} charts in{" "}
        {elapsed.toFixed(1)}ms
      </Alert>

      <SheetListContainer sheets={filteredResults} />
    </div>
  );
};
