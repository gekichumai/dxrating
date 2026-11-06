import { createContext, useContext } from 'react'

/**
 * How a sheet row lays out its content.
 *
 * - `stacked`: art, then the title with its badges and the version under it, then the level. Every list uses it on
 *   phones, and narrow surfaces (dialogs, pickers, the two-column chart lists) use it at every width.
 * - `table`: from `lg` the same row becomes one line of fixed columns (art | title | artist | version | badges |
 *   level). Only full-width lists opt in, because the columns are sized against the list's width, not the viewport's.
 *   Below `lg` it renders exactly like `stacked`.
 */
export type SheetRowLayout = 'stacked' | 'table'

export const SheetRowLayoutContext = createContext<SheetRowLayout>('stacked')

export const useSheetRowLayout = () => useContext(SheetRowLayoutContext)

/**
 * The columns of a `table` row. Every row is its own grid, so no column may size to its content (`auto`): fixed and
 * fractional tracks over the same width keep the columns lined up from row to row. 13rem fits the widest badge pair
 * (a Utage 2P banner, or DX plus a locked Re:MASTER pill). Each cell names its column and row (`lg:col-start-N
 * lg:row-start-1`), so a missing cell, such as an empty artist, leaves its column blank instead of shifting the rest.
 */
export const SHEET_TABLE_ROW_COLUMNS =
  'lg:grid lg:grid-cols-[40px_minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_13rem_3.5rem] lg:items-center lg:gap-3'

/** The horizontal inset of a sheet row inside a list surface, shared by every chart list so they line up */
export const SHEET_ROW_INSET = 'px-2 md:px-3'
/** {@link SHEET_ROW_INSET} for MUI rows, whose own padding needs overriding */
export const SHEET_ROW_INSET_IMPORTANT = '!px-2 md:!px-3'