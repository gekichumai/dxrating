import { FC, PropsWithChildren } from 'react'

export const TouchDeviceGuard: FC<
  PropsWithChildren<{
    renderOnlyOn: 'touch' | 'non-touch'
  }>
> = ({ renderOnlyOn, children }) => {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  return isTouchDevice === (renderOnlyOn === 'touch') ? children : null
}
