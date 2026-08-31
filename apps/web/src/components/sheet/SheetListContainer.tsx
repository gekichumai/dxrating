import clsx from 'clsx'
import { useCallback } from 'react'
import { type ItemContent, Virtuoso } from 'react-virtuoso'
import type { FlattenedSheet } from '../../songs'
import { SheetListItem, type SheetListItemAnalyticsProps } from './SheetListItem'

export const SheetListContainer = ({
  sheets,
  listContainerClassName,
  activeSheetId,
  onSheetDialogChange,
  analyticsSource,
  analyticsQueryPresent,
  analyticsResultCount,
}: {
  sheets: FlattenedSheet[]
  listContainerClassName?: string
  activeSheetId?: string | null
  onSheetDialogChange?: (sheet: FlattenedSheet | null) => void
  analyticsSource?: SheetListItemAnalyticsProps['source']
  analyticsQueryPresent?: boolean
  analyticsResultCount?: number
}) => {
  const ItemContent = useCallback<ItemContent<FlattenedSheet, unknown>>(
    (index, sheet: FlattenedSheet) => {
      if (!sheet) return null
      const analytics = analyticsSource
        ? {
            source: analyticsSource,
            position: index + 1,
            queryPresent: analyticsQueryPresent,
            resultCount: analyticsResultCount,
          }
        : undefined
      if (activeSheetId !== undefined && onSheetDialogChange) {
        return (
          <SheetListItem
            key={sheet.id}
            sheet={sheet}
            dialogOpen={sheet.id === activeSheetId}
            onDialogOpenChange={(open) => onSheetDialogChange(open ? sheet : null)}
            analytics={analytics}
          />
        )
      }
      return <SheetListItem key={sheet.id} sheet={sheet} analytics={analytics} />
    },
    [activeSheetId, analyticsQueryPresent, analyticsResultCount, analyticsSource, onSheetDialogChange],
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