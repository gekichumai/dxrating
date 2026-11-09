import { useSyncExternalStore } from 'react'

/** The phone/tablet boundary: dialogs become bottom sheets below it */
const LARGE_DEVICE_QUERY = '(min-width: 768px)'

let largeDeviceQuery: MediaQueryList | undefined
const getLargeDeviceQuery = () => (largeDeviceQuery ??= window.matchMedia(LARGE_DEVICE_QUERY))

const subscribe = (onChange: () => void) => {
  const query = getLargeDeviceQuery()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * Whether the viewport is at least 768px wide. One shared media query: react-use's createBreakpoint, used before,
 * re-subscribed to resize and read window.innerWidth after every render of every caller (each sheet row has one
 * through its dialog), which forced a layout in the middle of each interaction. The server and the first client
 * render report a phone, so hydration matches; the real value follows right after.
 */
export const useIsLargeDevice = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => getLargeDeviceQuery().matches,
    () => false,
  )
