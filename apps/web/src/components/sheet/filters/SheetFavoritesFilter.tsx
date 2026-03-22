import { Chip } from '@mui/material'
import type { FC } from 'react'
import { type Control, useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import MdiStar from '~icons/mdi/star'
import MdiStarOutline from '~icons/mdi/star-outline'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'

export const SheetFavoritesFilter: FC<{
  control: Control<SheetSortFilterForm>
}> = ({ control }) => {
  const { t } = useTranslation(['sheet'])
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.favoritesOnly'>({
    control,
    name: 'filters.favoritesOnly',
  })

  return (
    <SheetFilterSection title={t('sheet:filter.favorites.title')}>
      <Chip
        icon={value ? <MdiStar className="!text-amber-500" /> : <MdiStarOutline />}
        label={t('sheet:filter.favorites.only')}
        color={value ? 'primary' : 'default'}
        size="small"
        className="!rounded-lg"
        onClick={() => onChange(!value)}
      />
    </SheetFilterSection>
  )
}