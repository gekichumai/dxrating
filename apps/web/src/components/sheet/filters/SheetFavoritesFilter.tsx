import { Chip } from '@mui/material'
import type { FC } from 'react'
import { type Control, useController } from 'react-hook-form'
import MdiStar from '~icons/mdi/star'
import MdiStarOutline from '~icons/mdi/star-outline'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const SheetFavoritesFilter: FC<{
  control: Control<SheetSortFilterForm>
  reset: () => void
}> = ({ control, reset }) => {
  const locale = useLocale()
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.favoritesOnly'>({
    control,
    name: 'filters.favoritesOnly',
  })

  return (
    <SheetFilterSection titleLeft={m.sheet_filter_favorites_title({}, { locale })} reset={reset}>
      <Chip
        aria-pressed={value}
        icon={value ? <MdiStar className="!text-amber-500" /> : <MdiStarOutline />}
        label={m.sheet_filter_favorites_only({}, { locale })}
        color={value ? 'primary' : 'default'}
        size="small"
        className="!rounded-lg"
        onClick={() => onChange(!value)}
      />
    </SheetFilterSection>
  )
}