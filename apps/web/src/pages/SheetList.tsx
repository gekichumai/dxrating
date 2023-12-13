import { Alert, FormControlLabel, Switch, TextField } from "@mui/material";
import { FC, useMemo, useState } from "react";
import { SheetListContainer } from "../components/SheetListContainer";
import { DXVersionToDXDataVersionEnumMap } from "../models/context/AppContext";
import { useAppContext } from "../models/context/useAppContext";
import { useFilteredSheets, useSheets } from "../songs";

export const SheetList: FC = () => {
  const { version } = useAppContext();
  const { data: sheets } = useSheets();
  const [search, setSearch] = useState<string>("");
  const { results, elapsed } = useFilteredSheets(search);
  const [showOnlyCurrentVersion, setShowOnlyCurrentVersion] =
    useState<boolean>(false);

  const filteredResults = useMemo(() => {
    if (showOnlyCurrentVersion) {
      return results
        .filter(
          (sheet) => sheet.version === DXVersionToDXDataVersionEnumMap[version],
        )
        .sort((a, b) => b.internalLevelValue - a.internalLevelValue);
    }
    return results;
  }, [results, showOnlyCurrentVersion, version]);

  return (
    <div className="flex-container pb-global">
      <TextField
        label="Search"
        variant="outlined"
        value={search}
        fullWidth
        onChange={(e) => setSearch(e.target.value)}
      />

      <FormControlLabel
        control={
          <Switch
            checked={showOnlyCurrentVersion}
            onChange={(e) => setShowOnlyCurrentVersion(e.target.checked)}
          />
        }
        label={`Filter Current B15: Show only ${DXVersionToDXDataVersionEnumMap[version]} charts`}
      />

      <Alert severity="info" className="text-sm !rounded-full shadow-lg">
        Found {filteredResults.length} charts out of {sheets?.length} charts in{" "}
        {elapsed.toFixed(1)}ms
      </Alert>

      <SheetListContainer sheets={filteredResults} />
    </div>
  );
};
