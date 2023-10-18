import { Alert, TextField } from "@mui/material";
import { FC, useState } from "react";
import { SheetListContainer } from "../components/SheetListContainer";
import { useFilteredSheets, useSheets } from "../songs";

export const SheetList: FC = () => {
  const { data: sheets } = useSheets();
  const [search, setSearch] = useState<string>("");
  const { results, elapsed } = useFilteredSheets(search);

  return (
    <div className="flex-container pb-global">
      <TextField
        label="Search"
        variant="outlined"
        value={search}
        fullWidth
        onChange={(e) => setSearch(e.target.value)}
      />

      <Alert severity="info" className="text-sm !rounded-full shadow-lg">
        Found {results.length} results out of {sheets?.length} records in{" "}
        {elapsed.toFixed(1)}ms
      </Alert>

      <SheetListContainer sheets={results} />
    </div>
  );
};
