import { Button, Chip } from '@mui/material'
import type { FC } from 'react'
import { type Control, useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import MdiStar from '~icons/mdi/star'
import MdiStarOutline from '~icons/mdi/star-outline'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'
import MdiRestore from '~icons/mdi/restore'

export const SheetFavoritesFilter: FC<{
  control: Control<SheetSortFilterForm>
  reset: () => void
}> = ({ control, reset }) => {
  const { t } = useTranslation(['sheet'])
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.favoritesOnly'>({
    control,
    name: 'filters.favoritesOnly',
  })

  return (
    <SheetFilterSection
      title={
        <>
          {t('sheet:filter.favorites.title')}
          <div className="flex-1" />
          <Button
            sx={{ minWidth: 'auto', p: 1 }}
            className="px-1 py-1 text-xs inline-flex"
            color="error"
            variant="outlined"
            onClick={reset}
          >
            <MdiRestore />
          </Button>
        </>
      }
    >
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