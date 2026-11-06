import { type FC, type PropsWithChildren, useSyncExternalStore } from 'react'

const subscribe = () => () => {}
const getTouchSnapshot = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0
// Unknown on the server: render nothing there and on the first client render, so SSR markup matches
const getServerSnapshot = () => null

export const TouchDeviceGuard: FC<
  PropsWithChildren<{
    renderOnlyOn: 'touch' | 'non-touch'
  }>
> = ({ renderOnlyOn, children }) => {
  const isTouchDevice = useSyncExternalStore<boolean | null>(subscribe, getTouchSnapshot, getServerSnapshot)
  if (isTouchDevice === null) return null
  return isTouchDevice === (renderOnlyOn === 'touch') ? children : null
}