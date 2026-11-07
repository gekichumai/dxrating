import clsx from 'clsx'
import type { FC } from 'react'
import MdiViewGrid from '~icons/mdi/view-grid'
import MdiViewList from '~icons/mdi/view-list'
import type { PlainMessage } from '@/i18n/message'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { segmentedItem, segmentedItemBase, segmentedTrack } from '../completion/TableChrome'
import { SHEET_LIST_LAYOUTS, type SheetListLayout } from './sheetListLayout'

const LAYOUT_ICONS: Record<SheetListLayout, typeof MdiViewList> = {
  list: MdiViewList,
  grid: MdiViewGrid,
}

const LAYOUT_LABELS: Record<SheetListLayout, PlainMessage> = {
  list: m.sheet_layout_list,
  grid: m.sheet_layout_grid,
}

/**
 * Before hydration the layout is unknown (`null`), and the page shows the width's default by CSS: the list below `lg`,
 * the grid from it. The switch shows the same choice the same way. The selected colours match `segmentedItem`.
 */
const DEFAULT_FOR_WIDTH: Record<SheetListLayout, string> = {
  list: 'bg-accent-strong text-on-accent lg:bg-transparent lg:text-fg-1',
  grid: 'bg-transparent text-fg-1 lg:bg-accent-strong lg:text-on-accent',
}

/** List or grid, as a two-segment icon control beside the result count; the iOS app has the same pair */
export const SheetListLayoutToggle: FC<{
  layout: SheetListLayout | null
  onChange: (layout: SheetListLayout) => void
  className?: string
}> = ({ layout, onChange, className }) => {
  const locale = useLocale()

  return (
    <fieldset className={clsx(segmentedTrack, 'm-0 min-w-0 shrink-0 flex-nowrap', className)}>
      <legend className="sr-only">{m.sheet_layout_label({}, { locale })}</legend>
      {SHEET_LIST_LAYOUTS.map((value) => {
        const Icon = LAYOUT_ICONS[value]
        const label = LAYOUT_LABELS[value]({}, { locale })
        return (
          <button
            key={value}
            type="button"
            // Unknown until hydration, when the buttons can't be pressed yet anyway
            aria-pressed={layout === null ? undefined : layout === value}
            aria-label={label}
            title={label}
            onClick={() => {
              if (layout !== value) onChange(value)
            }}
            className={clsx(
              layout === null ? [segmentedItemBase, DEFAULT_FOR_WIDTH[value]] : segmentedItem(layout === value),
              // A segment that is not selected has no fill of its own, not the browser's button face
              layout !== null && layout !== value && 'bg-transparent',
              'cursor-pointer justify-center border-0 font-inherit !px-2',
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </button>
        )
      })}
    </fieldset>
  )
}