import { CategoryEnum, VersionEnum } from '@gekichumai/dxdata'
import { DevTool } from '@hookform/devtools'
import {
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grow,
  Paper,
} from '@mui/material'
import * as Collapsible from '@radix-ui/react-collapsible'
import clsx from 'clsx'
import { type FC, useContext, useEffect, useMemo, useState, useTransition } from 'react'
import { FormProvider, useForm, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useEffectOnce } from 'react-use'
import MdiChevronDownIcon from '~icons/mdi/chevron-down'
import { SheetDetailsContext } from '../../models/context/SheetDetailsContext'
import type { FlattenedSheet } from '../../songs'
import { SheetSortSelect } from './SheetSortSelect'
import { SheetCategoryFilter } from './filters/SheetCategoryFilter'
import { SheetInternalLevelFilter } from './filters/SheetInternalLevelFilter'
import { SheetTagFilter } from './filters/SheetTagFilter'
import { SheetVersionFilter } from './filters/SheetVersionFilter'

export interface SortPredicate {
  descriptor: keyof FlattenedSheet
  direction: 'asc' | 'desc'
}

export interface SheetSortFilterForm {
  filters: {
    versions: VersionEnum[]
    internalLevelValue?: {
      min: number
      max: number
    }
    tags: number[]
    categories: CategoryEnum[]
  }
  sorts: SortPredicate[]
}

export const getDefaultSheetSortFilterForm = (): SheetSortFilterForm => ({
  filters: {
    versions: Object.values(VersionEnum),
    internalLevelValue: {
      min: 1.0,
      max: 15.0,
    },
    tags: [],
    categories: Object.values(CategoryEnum),
  },
  sorts: [
    {
      descriptor: 'releaseDate',
      direction: 'desc',
    },
  ],
})

const CURRENT_SCHEMA_VERSION = 1

type SchemaFilterFormVersionZero = SheetSortFilterForm
const isSchemaFilterFormVersionZero = (v: unknown): v is SchemaFilterFormVersionZero => {
  if (typeof v !== 'object' || v === null) {
    return false
  }

  if (typeof (v as SchemaFilterFormVersionZero).filters !== 'object') {
    return false
  }

  if (typeof (v as SchemaFilterFormVersionZero).sorts !== 'object') {
    return false
  }

  return true
}
type SchemaFilterFormVersionOne = { version: 1; payload: SheetSortFilterForm }
const isSchemaFilterFormVersionOne = (v: unknown): v is SchemaFilterFormVersionOne => {
  if (typeof v !== 'object' || v === null) {
    return false
  }

  if ((v as SchemaFilterFormVersionOne).version !== 1) {
    return false
  }

  if (typeof (v as SchemaFilterFormVersionOne).payload !== 'object') {
    return false
  }

  return true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const migrations = {
  1: (v: SchemaFilterFormVersionZero): SheetSortFilterForm => {
    return {
      ...v,
      filters: {
        ...v.filters,
        versions: Object.values(VersionEnum),
      },
    }
  },
}

export const validateAndMigrate = (alreadySaved: unknown): SheetSortFilterForm => {
  if (typeof alreadySaved !== 'object') {
    throw new Error('Invalid saved sort filter')
  }
  const { version, payload } = (() => {
    if (isSchemaFilterFormVersionZero(alreadySaved)) {
      return {
        version: 0,
        payload: alreadySaved,
      }
    }

    if (isSchemaFilterFormVersionOne(alreadySaved)) {
      return alreadySaved
    }

    throw new Error('Invalid saved sort filter')
  })()

  if (payload.filters.tags === undefined) {
    payload.filters.tags = []
  }

  if (payload.filters.categories === undefined) {
    payload.filters.categories = Object.values(CategoryEnum)
  }

  // apply migrations
  let migrated = payload
  for (let i = version + 1; i <= CURRENT_SCHEMA_VERSION; i++) {
    if (migrations[i as keyof typeof migrations]) {
      migrated = migrations[i as keyof typeof migrations](migrated)
    }
  }

  return migrated
}

export const SheetSortFilter: FC<{
  onChange?: (form: SheetSortFilterForm) => void
}> = ({ onChange }) => {
  const defaultValues = useMemo(() => {
    const alreadySaved = window.localStorage.getItem('dxrating-sheet-sort-filter')
    if (alreadySaved) {
      try {
        return validateAndMigrate(JSON.parse(alreadySaved))
      } catch (e) {
        console.warn('Failed to parse saved sort filter', e)
      }
    }

    return getDefaultSheetSortFilterForm()
  }, [])

  const methods = useForm<SheetSortFilterForm>({
    mode: 'onChange',
    defaultValues,
  })

  useEffectOnce(() => {
    onChange?.(methods.getValues())
  })

  return (
    <FormProvider {...methods}>
      <SheetSortFilterFormListener onChange={onChange} />
      <SheetSortFilterFormContent />
    </FormProvider>
  )
}

const SheetSortFilterFormListener: FC<{
  onChange?: (form: SheetSortFilterForm) => void
}> = ({ onChange }) => {
  const { watch } = useFormContext<SheetSortFilterForm>()

  useEffect(() => {
    watch((data) => {
      if (data.filters || data.sorts) {
        onChange?.(data as SheetSortFilterForm)

        window.localStorage.setItem(
          'dxrating-sheet-sort-filter',
          JSON.stringify({
            version: CURRENT_SCHEMA_VERSION,
            payload: data,
          }),
        )
      }
    })
  }, [onChange, watch])

  return null
}

const SheetSortFilterFormReset: FC<{
  onReset: () => void
}> = ({ onReset }) => {
  const { t } = useTranslation(['sheet'])
  const [openDialog, setOpenDialog] = useState(false)

  return (
    <>
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} TransitionComponent={Grow}>
        <DialogTitle>Reset Sort and Filter Settings</DialogTitle>
        <DialogContent>
          <DialogContentText>Are you sure you want to reset the sort and filter settings?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpenDialog(false)
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setOpenDialog(false)
              onReset()
            }}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      <Button variant="outlined" color="error" onClick={() => setOpenDialog(true)} size="small">
        {t('sheet:sort-and-filter.reset')}
      </Button>
    </>
  )
}

const SheetSortFilterFormContent = () => {
  const { t } = useTranslation(['sheet'])
  const { queryActive } = useContext(SheetDetailsContext)
  const { control, reset } = useFormContext<SheetSortFilterForm>()
  const [expanded, setExpanded] = useState(false)
  const [pending, startTransition] = useTransition()

  const collapsibleInner = (
    <div className="p-2 w-full flex flex-col gap-4">
      <div className="m-2 flex flex-col gap-4">
        <div className="flex">
          <SheetSortFilterFormReset
            onReset={() => {
              reset(getDefaultSheetSortFilterForm())
              window.localStorage.removeItem('dxrating-sheet-sort-filter')
            }}
          />
        </div>

        <div className="text-xl font-bold tracking-tighter">
          <span className="whitespace-nowrap">{t('sheet:filter.title')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SheetCategoryFilter control={control} />
          <SheetVersionFilter control={control} />
          <SheetTagFilter control={control} />
          <SheetInternalLevelFilter control={control} />
        </div>
      </div>

      <div
        className={clsx(
          'p-2 flex flex-col gap-4 rounded-lg',
          queryActive && 'bg-gray-200 pointer-events-none saturation-0 shadow-[inset_0_1px_8px] shadow-gray-300',
        )}
      >
        <div className="text-xl font-bold tracking-tighter flex items-center">
          <div className="whitespace-nowrap leading-none">{t('sheet:sort.title')}</div>
          {queryActive && (
            <div className="px-1.5 py-1 rounded-md bg-gray-200 text-xs ml-2 leading-tight tracking-tight text-zinc-600 shadow-[0_1px_8px] shadow-gray-300">
              {t('sheet:sort.temporarily-disabled')}
            </div>
          )}
        </div>
        <SheetSortSelect control={control} />
      </div>
    </div>
  )

  return (
    <>
      {import.meta.env.DEV && <DevTool control={control} />}
      <Collapsible.Root
        open={expanded}
        onOpenChange={(expanded) => startTransition(() => setExpanded(expanded))}
        className="w-full"
      >
        <Paper className="w-full flex flex-col overflow-hidden">
          <Collapsible.Trigger asChild>
            <ButtonBase
              className={clsx(
                'px-4 w-full flex items-center transition-all duration-300',
                expanded ? 'bg-gray-200 py-4' : 'bg-gray-100 py-3',
              )}
            >
              <div className="text-xl font-bold tracking-tight leading-none">{t('sheet:sort-and-filter.title')}</div>
              {pending && <CircularProgress disableShrink className="ml-2 !h-4 !w-4" />}
              <div className="flex-1" />
              <MdiChevronDownIcon
                className={clsx('w-6 h-6 transition-transform', expanded && 'transform rotate-180')}
              />
            </ButtonBase>
          </Collapsible.Trigger>

          <Collapsible.Content className="radix__collapsible-content">{collapsibleInner}</Collapsible.Content>
        </Paper>
      </Collapsible.Root>
    </>
  )
}
