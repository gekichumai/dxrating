import clsx from "clsx";
import Fuse from "fuse.js";
import { useCallback } from "react";
import { ItemContent, Virtuoso } from "react-virtuoso";
import { FlattenedSheet } from "../songs";
import { SheetListItem } from "./SheetListItem";

export const SheetListContainer = ({
  sheets,
  listContainerClassName,
}: {
  sheets: Fuse.FuseResult<FlattenedSheet>[];
  listContainerClassName?: string;
}) => {
  const ItemContent = useCallback<
    ItemContent<Fuse.FuseResult<FlattenedSheet>, unknown>
  >(
    (_, sheet: Fuse.FuseResult<FlattenedSheet>) => (
      <SheetListItem sheet={sheet.item} />
    ),
    [],
  );

  return (
    <div className={clsx("rounded w-full", listContainerClassName)}>
      <Virtuoso
        useWindowScroll
        data={sheets}
        itemContent={ItemContent}
        className="w-full"
        increaseViewportBy={500}
      />
    </div>
  );
};
