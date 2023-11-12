import { VersionEnum } from "@gekichumai/dxdata";
import { Alert, FormControlLabel, Switch, TextField } from "@mui/material";
import { FC, useMemo, useState } from "react";
import { SheetListContainer } from "../components/SheetListContainer";
import { useFilteredSheets, useSheets } from "../songs";

export const SheetList: FC = () => {
  const { data: sheets } = useSheets();
  const [search, setSearch] = useState<string>("");
  const { results, elapsed } = useFilteredSheets(search);
  const [showOnlyFestival, setShowOnlyFestival] = useState<boolean>(false);

  const filteredResults = useMemo(() => {
    if (showOnlyFestival) {
      return results
        .filter((sheet) => sheet.version === VersionEnum.FESTIVALPLUS)
        .sort((a, b) => b.internalLevelValue - a.internalLevelValue);
    }
    return results;
  }, [results, showOnlyFestival]);

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
            checked={showOnlyFestival}
            onChange={(e) => setShowOnlyFestival(e.target.checked)}
          />
        }
        label="Filter Current B15: Show only FESTiVAL+ charts and sort by level (descending)"
      />

      <Alert severity="info" className="text-sm !rounded-full shadow-lg">
        Found {filteredResults.length} charts out of {sheets?.length} charts in{" "}
        {elapsed.toFixed(1)}ms
      </Alert>

      <SheetListContainer sheets={filteredResults} />
    </div>
  );
};
