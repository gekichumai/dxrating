import clsx from 'clsx'
import type { FC } from 'react'

/**
 * Text that takes the width of the widest of `sizers`, so a column of these lines up whatever each one says. The sizers
 * share one grid cell with the text, hidden, which keeps the width right in any font without a measured constant.
 * `hidden` keeps the width but hides the text too, for a cell whose text is drawn elsewhere.
 */
export const FixedWidthText: FC<{
  text: string
  sizers: readonly string[]
  className?: string
  /** On the shown text only, sized to it rather than to the widest sizer (e.g. a gradient clipped to the text) */
  textClassName?: string
  hidden?: boolean
  'aria-hidden'?: boolean
}> = ({ text, sizers, className, textClassName, hidden, 'aria-hidden': ariaHidden }) => (
  <span className={clsx('inline-grid', className)} aria-hidden={ariaHidden}>
    {sizers.map((sizer) => (
      <span key={sizer} aria-hidden className="invisible col-start-1 row-start-1">
        {sizer}
      </span>
    ))}
    <span className={clsx('col-start-1 row-start-1', textClassName, hidden && 'invisible')}>{text}</span>
  </span>
)