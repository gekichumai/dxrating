import { CategoryEnum, DifficultyEnum, VERSION_SORT_ORDER, VersionEnum } from '@gekichumai/dxdata'
import { DevTool } from '@hookform/devtools'
import {
  Button,
  ButtonBase,
  Collapse,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grow,
  Paper,
} from '@mui/material'
import clsx from 'clsx'
import { type FC, useContext, useEffect, useId, useState, useTransition } from 'react'
import { FormProvider, useForm, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useEffectOnce } from 'react-use'
import MdiChevronDownIcon from '~icons/mdi/chevron-down'
import MdiFilterIcon from '~icons/mdi/filter'
import { SheetDetailsContext } from '../../models/context/SheetDetailsContext'
import type { FlattenedSheet } from '../../songs'
import { SheetSortSelect } from './SheetSortSelect'
import { SheetCategoryFilter } from './filters/SheetCategoryFilter'
import { SheetFavoritesFilter } from './filters/SheetFavoritesFilter'
import { SheetDifficultyFilter } from './filters/SheetDifficultyFilter'
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
    difficulties: DifficultyEnum[]
    favoritesOnly: boolean
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
    difficulties: Object.values(DifficultyEnum),
    favoritesOnly: false,
  },
  sorts: [
    {
      descriptor: 'releaseDate',
      direction: 'desc',
    },
  ],
})

const CURRENT_SCHEMA_VERSION = 1
const SHEET_SORT_FILTER_STORAGE_KEY = 'dxrating-sheet-sort-filter'
const LATEST_VERSION_KEY = 'dxrating-known-latest-game-version'
const SHEET_SORT_FILTER_TTL = 5 * 60 * 1000

const clearPersistedSheetSortFilter = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SHEET_SORT_FILTER_STORAGE_KEY)
  }
}

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

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
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

  if (payload.filters.favoritesOnly === undefined) {
    payload.filters.favoritesOnly = false
  }

  if (payload.filters.difficulties === undefined) {
    payload.filters.difficulties = Object.values(DifficultyEnum)
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

const loadSavedSheetSortFilterForm = (): SheetSortFilterForm | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const currentLatest = VERSION_SORT_ORDER[VERSION_SORT_ORDER.length - 1]
  const storedLatest = window.localStorage.getItem(LATEST_VERSION_KEY)

  if (storedLatest !== currentLatest) {
    clearPersistedSheetSortFilter()
    window.localStorage.setItem(LATEST_VERSION_KEY, currentLatest)
    return null
  }

  const alreadySaved = window.localStorage.getItem(SHEET_SORT_FILTER_STORAGE_KEY)
  if (!alreadySaved) {
    return null
  }

  try {
    const parsed = JSON.parse(alreadySaved)
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
      clearPersistedSheetSortFilter()
      return null
    }
    return validateAndMigrate(parsed)
  } catch (e) {
    console.warn('Failed to parse saved sort filter', e)
    clearPersistedSheetSortFilter()
    return null
  }
}

export const SheetSortFilter: FC<{
  onChange?: (form: SheetSortFilterForm) => void
  expanded?: boolean
  contentId?: string
  onExpandedChange?: (expanded: boolean) => void
  showDefaultTrigger?: boolean
}> = ({ onChange, expanded, contentId, onExpandedChange, showDefaultTrigger }) => {
  const methods = useForm<SheetSortFilterForm>({
    mode: 'onChange',
    defaultValues: getDefaultSheetSortFilterForm(),
  })

  useEffectOnce(() => {
    const savedValues = loadSavedSheetSortFilterForm()

    if (savedValues) {
      methods.reset(savedValues)
      onChange?.(savedValues)
      return
    }

    onChange?.(methods.getValues())
  })

  return (
    <FormProvider {...methods}>
      <SheetSortFilterFormListener onChange={onChange} />
      <SheetSortFilterFormContent
        expanded={expanded}
        contentId={contentId}
        onExpandedChange={onExpandedChange}
        showDefaultTrigger={showDefaultTrigger}
      />
    </FormProvider>
  )
}

const SheetSortFilterFormListener: FC<{
  onChange?: (form: SheetSortFilterForm) => void
}> = ({ onChange }) => {
  const { watch } = useFormContext<SheetSortFilterForm>()

  useEffect(() => {
    const subscription = watch((data) => {
      if (data.filters || data.sorts) {
        onChange?.(data as SheetSortFilterForm)
        const lastActiveAt = Date.now()

        window.localStorage.setItem(
          SHEET_SORT_FILTER_STORAGE_KEY,
          JSON.stringify({
            version: CURRENT_SCHEMA_VERSION,
            payload: data,
            expiresAt: lastActiveAt + SHEET_SORT_FILTER_TTL,
          }),
        )
      }
    })

    return () => subscription.unsubscribe()
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
        <DialogTitle>{t('sheet:sort-and-filter.reset.dialog.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('sheet:sort-and-filter.reset.dialog.message')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpenDialog(false)
            }}
          >
            {t('sheet:sort-and-filter.reset.dialog.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setOpenDialog(false)
              onReset()
            }}
          >
            {t('sheet:sort-and-filter.reset.dialog.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <Button variant="outlined" color="error" onClick={() => setOpenDialog(true)} size="small">
        {t('sheet:sort-and-filter.reset.button')}
      </Button>
    </>
  )
}

export const SheetSortFilterTrigger: FC<{
  expanded: boolean
  contentId: string
  onToggle: () => void
  pending?: boolean
  variant?: 'bar' | 'compact'
  className?: string
}> = ({ expanded, contentId, onToggle, pending = false, variant = 'bar', className }) => {
  const { t } = useTranslation(['sheet'])

  if (variant === 'compact') {
    return (
      <Button
        variant="outlined"
        color="inherit"
        className={clsx(
          'relative !min-h-[56px] !min-w-[6.25rem] shrink-0 !px-3 !py-1.5 !normal-case transition-all duration-300',
          '!flex !items-center !justify-center gap-1.5 !text-zinc-900 shadow-sm backdrop-blur-sm',
          expanded ? '!border-zinc-500 !bg-gray-200' : '!border-zinc-400/70 !bg-white/70 hover:!bg-white/90',
          className,
        )}
        aria-label={t('sheet:sort-and-filter.title')}
        aria-controls={contentId}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <MdiFilterIcon className="h-5 w-5 shrink-0" />
        <span className="flex flex-col text-left text-[0.7rem] font-bold leading-[0.9rem] tracking-normal">
          <span className="whitespace-nowrap">{t('sheet:filter.title')}</span>
          <span className="whitespace-nowrap">{t('sheet:sort.title')}</span>
        </span>
        <MdiChevronDownIcon
          className={clsx('h-4 w-4 shrink-0 transition-transform duration-300', expanded && 'transform rotate-180')}
        />
        {pending && <CircularProgress disableShrink className="absolute right-1 top-1 !h-3 !w-3" />}
      </Button>
    )
  }

  return (
    <ButtonBase
      className={clsx(
        'px-4 w-full flex items-center transition-all duration-300',
        expanded ? 'bg-gray-200 py-4' : 'bg-gray-100 py-3',
        className,
      )}
      aria-controls={contentId}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <div className="text-xl font-bold tracking-tight leading-none">{t('sheet:sort-and-filter.title')}</div>
      {pending && <CircularProgress disableShrink className="ml-2 !h-4 !w-4" />}
      <div className="flex-1" />
      <MdiChevronDownIcon className={clsx('w-6 h-6 transition-transform', expanded && 'transform rotate-180')} />
    </ButtonBase>
  )
}

const SheetSortFilterFormContent: FC<{
  expanded?: boolean
  contentId?: string
  onExpandedChange?: (expanded: boolean) => void
  showDefaultTrigger?: boolean
}> = ({ expanded: controlledExpanded, contentId, onExpandedChange, showDefaultTrigger = true }) => {
  const { t } = useTranslation(['sheet'])
  const { queryActive } = useContext(SheetDetailsContext)
  const { control, setValue, reset } = useFormContext<SheetSortFilterForm>()
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const [pending, startTransition] = useTransition()
  const generatedContentId = useId()
  const resolvedContentId = contentId ?? generatedContentId
  const expanded = controlledExpanded ?? uncontrolledExpanded

  const toggleExpanded = () => {
    startTransition(() => {
      if (controlledExpanded === undefined) {
        setUncontrolledExpanded((currentExpanded) => {
          const nextExpanded = !currentExpanded
          onExpandedChange?.(nextExpanded)
          return nextExpanded
        })
        return
      }

      onExpandedChange?.(!controlledExpanded)
    })
  }

  const resetByFilter = (...filters: (keyof SheetSortFilterForm['filters'])[]) => {
    const defaultForm = getDefaultSheetSortFilterForm()
    for (const filter of filters) {
      setValue(`filters.${filter}`, defaultForm.filters[filter])
    }
  }

  const collapsibleInner = (
    <div className="p-2 w-full flex flex-col gap-4">
      <div className="m-2 flex flex-col gap-4">
        <div className="flex">
          <SheetSortFilterFormReset
            onReset={() => {
              reset(getDefaultSheetSortFilterForm())
              clearPersistedSheetSortFilter()
            }}
          />
        </div>

        <div className="text-xl font-bold tracking-tighter">
          <span className="whitespace-nowrap">{t('sheet:filter.title')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SheetTagFilter control={control} reset={() => resetByFilter('tags')} />
          <SheetInternalLevelFilter control={control} reset={() => resetByFilter('internalLevelValue')} />
          <SheetCategoryFilter control={control} reset={() => resetByFilter('categories')} />
          <SheetDifficultyFilter control={control} reset={() => resetByFilter('difficulties')} />
          <SheetVersionFilter control={control} reset={() => resetByFilter('versions')} />
          <SheetFavoritesFilter control={control} reset={() => resetByFilter('favoritesOnly')} />
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
      {showDefaultTrigger ? (
        <Paper className="w-full flex flex-col overflow-hidden">
          <SheetSortFilterTrigger
            expanded={expanded}
            contentId={resolvedContentId}
            onToggle={toggleExpanded}
            pending={pending}
          />

          <Collapse className="w-full" in={expanded} timeout={275} unmountOnExit>
            <div id={resolvedContentId}>{collapsibleInner}</div>
          </Collapse>
        </Paper>
      ) : (
        <Collapse className="w-full" in={expanded} timeout={275} unmountOnExit>
          <Paper className="w-full flex flex-col overflow-hidden">
            <div id={resolvedContentId}>{collapsibleInner}</div>
          </Paper>
        </Collapse>
      )}
    </>
  )
}