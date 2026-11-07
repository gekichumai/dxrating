import { FormControl, IconButton, InputLabel, MenuItem, Select } from '@mui/material'
import { AnimatePresence } from 'motion/react'
import { type FC, useContext, useMemo } from 'react'
import { type Control, Controller, useFieldArray } from 'react-hook-form'
import MdiAdd from '~icons/mdi/add'
import MdiClose from '~icons/mdi/close'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { SheetDetailsContext } from '../../models/context/SheetDetailsContext'
import { MotionButton } from '../../utils/motion'
import type { SheetSortFilterForm, SortPredicate } from './SheetSortFilter'

const SortPredicateTransformer = {
  to: (value: string) => {
    const [descriptor, direction] = value.split('_')
    return {
      descriptor,
      direction,
    } as SortPredicate
  },
  from: (value: SortPredicate) => {
    return `${value.descriptor}_${value.direction}`
  },
}

export const SheetSortSelect: FC<{
  control: Control<SheetSortFilterForm>
}> = ({ control }) => {
  const { queryActive } = useContext(SheetDetailsContext)
  const locale = useLocale()
  const { fields, append, remove } = useFieldArray<SheetSortFilterForm>({
    control,
    name: 'sorts',
  })

  const addSortButtonVariants = useMemo(
    () => ({
      initial: { opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 0.96, opacity: 0 },
    }),
    [],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fields.map((field, index) => (
        <Controller
          name={`sorts.${index}`}
          key={field.id}
          render={({ field }) => (
            <FormControl>
              <InputLabel id={`sorts.${index}.label`}>
                {index === 0 ? m.sheet_sort_by({}, { locale }) : m.sheet_sort_thenBy({}, { locale })}
              </InputLabel>
              <Select
                label={index === 0 ? m.sheet_sort_by({}, { locale }) : m.sheet_sort_thenBy({}, { locale })}
                labelId={`sorts.${index}.label`}
                id={`sorts.${index}`}
                value={SortPredicateTransformer.from(field.value)}
                onChange={(e) => {
                  field.onChange(SortPredicateTransformer.to(e.target.value))
                }}
                disabled={queryActive}
                size="small"
                {...(index > 0 && {
                  endAdornment: (
                    <IconButton
                      size="small"
                      aria-label={m.sheet_sort_remove({ index: index + 1 }, { locale })}
                      disabled={queryActive}
                      onClick={() => remove(index)}
                    >
                      <MdiClose aria-hidden="true" />
                    </IconButton>
                  ),
                })}
              >
                <MenuItem value="releaseDate_desc">{m.sheet_sort_releaseDate_desc({}, { locale })}</MenuItem>
                <MenuItem value="releaseDate_asc">{m.sheet_sort_releaseDate_asc({}, { locale })}</MenuItem>
                <MenuItem value="internalLevelValue_desc">
                  {m.sheet_sort_internalLevelValue_desc({}, { locale })}
                </MenuItem>
                <MenuItem value="internalLevelValue_asc">
                  {m.sheet_sort_internalLevelValue_asc({}, { locale })}
                </MenuItem>
              </Select>
            </FormControl>
          )}
        />
      ))}
      <AnimatePresence mode="popLayout">
        {fields.length <= 5 && (
          <MotionButton
            layout
            onClick={() => append({ descriptor: 'internalLevelValue', direction: 'desc' })}
            startIcon={<MdiAdd aria-hidden="true" />}
            variant="contained"
            variants={addSortButtonVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            disabled={queryActive}
          >
            {m.sheet_sort_add({}, { locale })}
          </MotionButton>
        )}
      </AnimatePresence>
    </div>
  )
}