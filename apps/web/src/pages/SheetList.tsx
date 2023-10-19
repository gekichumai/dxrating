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
        .filter(
          (sheet) =>
            sheet.item.version === VersionEnum.FESTIVAL ||
            sheet.item.version === VersionEnum.FESTIVALPLUS,
        )
        .sort((a, b) => a.item.internalLevelValue - b.item.internalLevelValue);
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
        label="Filter B15: Show only FESTiVAL/FESTiVAL+ charts and sort by level (ascending)"
      />

      <Alert severity="info" className="text-sm !rounded-full shadow-lg">
        Found {filteredResults.length} results out of {sheets?.length} records
        in {elapsed.toFixed(1)}ms
      </Alert>

      <SheetListContainer sheets={filteredResults} />
    </div>
  );
};
