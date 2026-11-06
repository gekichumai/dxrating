import type { FC, ReactNode } from 'react'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'
import MdiGestureTap from '~icons/mdi/gesture-tap'
import MdiGestureTapHold from '~icons/mdi/gesture-tap-hold'

const GESTURE_ICON = {
  tap: MdiGestureTap,
  'tap-hold': MdiGestureTapHold,
}
const GESTURE_LABEL = {
  tap: m.global_gestureHint_tap,
  'tap-hold': m.global_gestureHint_tapHold,
} satisfies Record<'tap' | 'tap-hold', PlainMessage>
export const GestureHint: FC<{
  gesture: 'tap' | 'tap-hold'
  description: ReactNode
}> = ({ gesture, description }) => {
  const locale = useLocale()
  const GestureIcon = GESTURE_ICON[gesture]

  return (
    <div className="glass-inset !rounded-full px-1.5 py-0.5 text-xs ml-1 inline-flex items-center gap-1 text-fg-2 select-none">
      <GestureIcon aria-hidden="true" />
      <span className="font-semibold">{GESTURE_LABEL[gesture]({}, { locale })}</span>
      <div className="bg-[var(--glass-border)] w-px h-3" aria-hidden="true" />
      <span>{description}</span>
    </div>
  )
}