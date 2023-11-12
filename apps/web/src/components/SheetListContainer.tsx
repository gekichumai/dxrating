import clsx from "clsx";
import { useCallback } from "react";
import { ItemContent, Virtuoso } from "react-virtuoso";
import { FlattenedSheet } from "../songs";
import { SheetListItem } from "./SheetListItem";

export const SheetListContainer = ({
  sheets,
  listContainerClassName,
}: {
  sheets: FlattenedSheet[];
  listContainerClassName?: string;
}) => {
  const ItemContent = useCallback<ItemContent<FlattenedSheet, unknown>>(
    (_, sheet: FlattenedSheet) => <SheetListItem sheet={sheet} />,
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
