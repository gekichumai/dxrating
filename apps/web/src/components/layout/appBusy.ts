import { useSyncExternalStore } from 'react'

/**
 * Work outside the router that the visitor is waiting on (switching the game version re-renders every page), so the
 * top progress bar can show for it as it does for a page load. Each piece of work holds a token until it ends.
 */
let busyCount = 0
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

/** Marks the app busy until the returned function is called (extra calls do nothing) */
export const beginAppBusy = (): (() => void) => {
  busyCount += 1
  emit()
  let ended = false
  return () => {
    if (ended) return
    ended = true
    busyCount -= 1
    emit()
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether anything is busy. Always false on the server and in the first client render, so hydration agrees */
export const useAppBusy = () =>
  useSyncExternalStore(
    subscribe,
    () => busyCount > 0,
    () => false,
  )