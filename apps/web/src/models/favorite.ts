import { useCallback, useSyncExternalStore } from 'react'

// Favorite sheets live in localStorage. Every reader goes through this store, so a write from anywhere (a star, the
// saved-data migration, another tab) reaches each mounted favorite control, and a toggle always starts from what
// storage holds now rather than from a list read when the control mounted.

export const FAVORITE_SHEETS_STORAGE_KEY = 'favorite-sheets'
const FAVORITE_SHEETS_CHANGED_EVENT = 'dxrating:favorite-sheets-changed'

let lastRaw: string | null | undefined
let lastIds: readonly string[] = []

/** The favorite sheet IDs in storage now */
export const readFavoriteSheetIds = (storage: Storage = window.localStorage): readonly string[] => {
  const raw = storage.getItem(FAVORITE_SHEETS_STORAGE_KEY)
  if (raw === lastRaw) return lastIds
  let ids: readonly string[] = []
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    // An unreadable value counts as no favorites; it is replaced on the next toggle
  }
  lastRaw = raw
  lastIds = ids
  return ids
}

/** Replaces the favorite sheet IDs in storage and tells every mounted favorite control */
export const writeFavoriteSheetIds = (ids: readonly string[], storage: Storage = window.localStorage) => {
  storage.setItem(FAVORITE_SHEETS_STORAGE_KEY, JSON.stringify(ids))
  window.dispatchEvent(new Event(FAVORITE_SHEETS_CHANGED_EVENT))
}

const subscribe = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === FAVORITE_SHEETS_STORAGE_KEY) onChange()
  }
  window.addEventListener(FAVORITE_SHEETS_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(FAVORITE_SHEETS_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

// Storage is not read during SSR or hydration: favorites show once the page has hydrated
const getServerSnapshot = () => false

export const useSheetFavoriteState = (id: string): [boolean, () => boolean] => {
  const isFavorite = useSyncExternalStore(subscribe, () => readFavoriteSheetIds().includes(id), getServerSnapshot)

  const toggleFavorite = useCallback(() => {
    const ids = readFavoriteSheetIds()
    const favored = ids.includes(id)
    writeFavoriteSheetIds(favored ? ids.filter((item) => item !== id) : [...ids, id])
    return !favored
  }, [id])

  return [isFavorite, toggleFavorite]
}