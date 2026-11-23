import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { persisted } from '@/utils/persisted'

/** How the home page lays out its charts: rows, or a grid of jackets. The iOS app's Search results have the same pair */
export type SheetListLayout = 'list' | 'grid'

export const SHEET_LIST_LAYOUTS: readonly SheetListLayout[] = ['list', 'grid']

export const SHEET_LIST_LAYOUT_STORAGE_KEY = 'sheet-list-layout'

/**
 * Until the visitor picks a layout, screens from the `lg` breakpoint show the grid; phones and tablets get the list,
 * which is more compact. Keep in step with the `lg:` classes that show the same default before hydration (SheetList,
 * SheetListLayoutToggle).
 */
export const SHEET_GRID_DEFAULT_MEDIA_QUERY = '(min-width: 1024px)'

const storedLayout = persisted(SHEET_LIST_LAYOUT_STORAGE_KEY, z.enum(['list', 'grid']), null, { format: 'text' })

const gridDefaultMediaQuery = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia(SHEET_GRID_DEFAULT_MEDIA_QUERY) : null

const subscribeToViewport = (onChange: () => void) => {
  const query = gridDefaultMediaQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

const readGridIsDefault = () => gridDefaultMediaQuery()?.matches ?? false

// Neither the stored choice nor the viewport exists on the server, and hydration must match the server's HTML
const getUnknownSnapshot = () => null

/**
 * The visitor's layout: the one they picked, remembered in this browser, or else the default for the screen width.
 *
 * It is `null` on the server and during hydration, where neither is known. The page then renders both layouts and lets
 * CSS show the default for the width, so the edge-cached HTML is the same for everyone and nothing moves for a visitor
 * who never picked one. Components that mount after hydration get the layout on their first render.
 */
export const useSheetListLayout = (): [SheetListLayout | null, (layout: SheetListLayout) => void] => {
  const stored = useSyncExternalStore(storedLayout.subscribe, storedLayout.get, getUnknownSnapshot)
  const gridIsDefault = useSyncExternalStore(subscribeToViewport, readGridIsDefault, getUnknownSnapshot)

  const layout = gridIsDefault === null ? null : (stored ?? (gridIsDefault ? 'grid' : 'list'))

  return [layout, storedLayout.set]
}