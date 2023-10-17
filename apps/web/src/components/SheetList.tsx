import { TextField } from "@mui/material";
import Fuse from "fuse.js";
import { FC, useEffect, useMemo, useState } from "react";
import { FlattenedSheet, getFlattenedSheets } from "../songs";
import { SheetListContainer } from "./SheetListContainer";

export const SheetList: FC = () => {
  const [sheets, setSheets] = useState<FlattenedSheet[]>([]);
  const [search, setSearch] = useState<string>("");
  const [filteredSheets, setFilteredSheets] = useState<
    Fuse.FuseResult<FlattenedSheet>[]
  >([]);

  useEffect(() => {
    getFlattenedSheets()
      .then((sheets) => {
        setSheets(sheets);
        setFilteredSheets(
          sheets.map((sheet) => ({
            item: sheet as FlattenedSheet,
            refIndex: 0,
          })),
        );
      })
      .catch((err) => console.error(err));
  }, []);

  const fuseInstance = useMemo(() => {
    return new Fuse(sheets, {
      keys: ["searchAcronym"],
    });
  }, [sheets]);

  useEffect(() => {
    if (search.length === 0) {
      setFilteredSheets(
        sheets.map((sheet) => ({
          item: sheet as FlattenedSheet,
          refIndex: 0,
        })),
      );
    } else {
      setFilteredSheets(fuseInstance.search(search));
    }
  }, [search, sheets, fuseInstance]);

  return (
    <div className="flex flex-col items-center justify-center p-4 gap-4">
      <TextField
        label="Search"
        variant="outlined"
        value={search}
        fullWidth
        onChange={(e) => setSearch(e.target.value)}
      />

      <SheetListContainer
        sheets={filteredSheets}
        listContainerClassName={search && "p-2 bg-orange-100"}
      />
    </div>
  );
};
