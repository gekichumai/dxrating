import clsx from 'clsx'
import { useCallback } from 'react'
import { type ItemContent, Virtuoso } from 'react-virtuoso'
import type { FlattenedSheet } from '../../songs'
import { SheetListItem } from './SheetListItem'

export const SheetListContainer = ({
  sheets,
  listContainerClassName,
  activeSheetId,
  onSheetDialogChange,
}: {
  sheets: FlattenedSheet[]
  listContainerClassName?: string
  activeSheetId?: string | null
  onSheetDialogChange?: (sheet: FlattenedSheet | null) => void
}) => {
  const ItemContent = useCallback<ItemContent<FlattenedSheet, unknown>>(
    (_, sheet: FlattenedSheet) => {
      if (!sheet) return null
      if (activeSheetId !== undefined && onSheetDialogChange) {
        return (
          <SheetListItem
            key={sheet.id}
            sheet={sheet}
            dialogOpen={sheet.id === activeSheetId}
            onDialogOpenChange={(open) => onSheetDialogChange(open ? sheet : null)}
          />
        )
      }
      return <SheetListItem key={sheet.id} sheet={sheet} />
    },
    [activeSheetId, onSheetDialogChange],
  )

  return (
    <div className={clsx('w-full', listContainerClassName)}>
      <Virtuoso
        useWindowScroll
        data={sheets}
        itemContent={ItemContent}
        className="w-full min-h-[100lvh]"
        increaseViewportBy={500}
        initialItemCount={Math.min(sheets.length, 20)}
      />
    </div>
  )
}