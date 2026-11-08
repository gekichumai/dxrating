import { useCallback, useSyncExternalStore } from 'react'

/** How the home page lays out its charts: rows, or a grid of jackets. The iOS app's Search results have the same pair */
export type SheetListLayout = 'list' | 'grid'

export const SHEET_LIST_LAYOUTS: readonly SheetListLayout[] = ['list', 'grid']

export const SHEET_LIST_LAYOUT_STORAGE_KEY = 'sheet-list-layout'
const SHEET_LIST_LAYOUT_CHANGED_EVENT = 'dxrating:sheet-list-layout-changed'

/**
 * Until the visitor picks a layout, screens from the `lg` breakpoint show the grid; phones and tablets get the list,
 * which is more compact. Keep in step with the `lg:` classes that show the same default before hydration (SheetList,
 * SheetListLayoutToggle).
 */
export const SHEET_GRID_DEFAULT_MEDIA_QUERY = '(min-width: 1024px)'

const isSheetListLayout = (value: unknown): value is SheetListLayout => value === 'list' || value === 'grid'

// A choice made on this page load that storage refused to save (a full store, blocked site data, a private window). It
// wins over whatever storage still holds, so the switch keeps working; the next save that succeeds clears it, and storage
// (shared with other tabs) is the source again.
let unsavedLayout: SheetListLayout | null = null

const readStoredLayout = (): SheetListLayout | null => {
  if (unsavedLayout) return unsavedLayout
  try {
    const stored = window.localStorage.getItem(SHEET_LIST_LAYOUT_STORAGE_KEY)
    if (isSheetListLayout(stored)) return stored
  } catch {
    // Storage is unavailable: no stored choice
  }
  return null
}

const subscribeToStoredLayout = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SHEET_LIST_LAYOUT_STORAGE_KEY) onChange()
  }
  window.addEventListener(SHEET_LIST_LAYOUT_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(SHEET_LIST_LAYOUT_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

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
  const stored = useSyncExternalStore(subscribeToStoredLayout, readStoredLayout, getUnknownSnapshot)
  const gridIsDefault = useSyncExternalStore(subscribeToViewport, readGridIsDefault, getUnknownSnapshot)

  const layout = gridIsDefault === null ? null : (stored ?? (gridIsDefault ? 'grid' : 'list'))

  const setLayout = useCallback((next: SheetListLayout) => {
    try {
      window.localStorage.setItem(SHEET_LIST_LAYOUT_STORAGE_KEY, next)
      unsavedLayout = null
    } catch {
      // Kept for this page load only, over any older choice storage still holds
      unsavedLayout = next
    }
    window.dispatchEvent(new Event(SHEET_LIST_LAYOUT_CHANGED_EVENT))
  }, [])

  return [layout, setLayout]
}