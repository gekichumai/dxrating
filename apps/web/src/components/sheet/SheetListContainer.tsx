import clsx from 'clsx'
import { useCallback } from 'react'
import { type ItemContent, Virtuoso } from 'react-virtuoso'
import type { FlattenedSheet } from '../../songs'
import { SheetListItem } from './SheetListItem'

export const SheetListContainer = ({
  sheets,
  listContainerClassName,
}: {
  sheets: FlattenedSheet[]
  listContainerClassName?: string
}) => {
  const ItemContent = useCallback<ItemContent<FlattenedSheet, unknown>>(
    (_, sheet: FlattenedSheet) => (sheet ? <SheetListItem key={sheet.id} sheet={sheet} navigateToDetail /> : null),
    [],
  )

  return (
    <div className={clsx('w-full', listContainerClassName)}>
      <Virtuoso
        useWindowScroll
        data={sheets}
        itemContent={ItemContent}
        className="w-full min-h-[100lvh]"
        increaseViewportBy={500}
        initialItemCount={Math.min(sheets.length, typeof window === 'undefined' ? 50 : 20)}
      />
    </div>
  )
}