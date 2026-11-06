import clsx from 'clsx'
import { useCallback } from 'react'
import { type ItemContent, Virtuoso } from 'react-virtuoso'
import type { FlattenedSheet } from '../../songs'
import { MaterialSurface } from '../global/MaterialSurface'
import { SheetListItem, type SheetListItemAnalyticsProps } from './SheetListItem'
import { SheetRowLayoutContext } from './sheetRowLayout'

// From lg the rows use the 12px inset of the server-rendered search rows (SearchQuerySeedList), so nothing moves when
// the virtualised list replaces them
const ROW_INSET = '!px-4 lg:!px-3'

/** The rows a list renders before it can measure the viewport: all a server render shows */
export const SHEET_LIST_FIRST_SCREEN_ROWS = 20

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
            insetClassName={ROW_INSET}
          />
        )
      }
      return <SheetListItem key={sheet.id} sheet={sheet} analytics={analytics} insetClassName={ROW_INSET} />
    },
    [activeSheetId, analyticsQueryPresent, analyticsResultCount, analyticsSource, onSheetDialogChange],
  )

  return (
    // The outer box keeps the page height steady while results change; the glass panel hugs the rows, which sit at a
    // 4px inset so their 8px radius nests in its 12px one. The list spans the page, so from lg each row is one line of
    // columns (56px) rather than a stacked card; Virtuoso measures rows, so no fixed item height needs to agree
    <SheetRowLayoutContext.Provider value="table">
      <div className={clsx('w-full min-h-[100lvh]', listContainerClassName)}>
        {sheets.length > 0 && (
          <MaterialSurface className="w-full p-1">
            <Virtuoso
              useWindowScroll
              data={sheets}
              itemContent={ItemContent}
              className="w-full"
              increaseViewportBy={500}
              initialItemCount={Math.min(sheets.length, SHEET_LIST_FIRST_SCREEN_ROWS)}
            />
          </MaterialSurface>
        )}
      </div>
    </SheetRowLayoutContext.Provider>
  )
}