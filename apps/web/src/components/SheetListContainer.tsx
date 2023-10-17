import clsx from "clsx";
import Fuse from "fuse.js";
import { useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { FlattenedSheet } from "../songs";
import { SheetCard } from "./SheetCard";

export const SheetListContainer = ({
  sheets,
  listContainerClassName,
}: {
  sheets: Fuse.FuseResult<FlattenedSheet>[];
  listContainerClassName?: string;
}) => {
  return (
    <>
      <div className="w-full bg-blue-400 rounded p-2">
        Sheets: {sheets.length} | Current internal level version:{" "}
        <span className="font-bold">FESTiVAL PLUS</span>
      </div>

      <div className={clsx("rounded w-full", listContainerClassName)}>
        <Virtuoso
          useWindowScroll
          data={sheets}
          itemContent={(_, sheet: Fuse.FuseResult<FlattenedSheet>) => (
            <SheetCard sheet={sheet.item} />
          )}
          className="w-full"
          increaseViewportBy={500}
        />
      </div>
    </>
  );
};
