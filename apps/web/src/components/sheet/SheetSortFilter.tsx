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
} from '@mui/material'
import clsx from 'clsx'
import { MotionConfig, useReducedMotion } from 'motion/react'
import { type FC, useContext, useEffect, useId, useState, useTransition } from 'react'
import { FormProvider, useForm, useFormContext } from 'react-hook-form'
import { useEffectOnce } from 'react-use'
import MdiChevronDownIcon from '~icons/mdi/chevron-down'
import MdiFilterIcon from '~icons/mdi/filter'
import MdiInformationOutline from '~icons/mdi/information-outline'
import MdiRestore from '~icons/mdi/restore'
import { SheetDetailsContext } from '../../models/context/SheetDetailsContext'
import type { FlattenedSheet } from '../../songs'
import { SheetSortSelect } from './SheetSortSelect'
import { SheetCategoryFilter } from './filters/SheetCategoryFilter'
import { SheetFavoritesFilter } from './filters/SheetFavoritesFilter'
import { SheetDifficultyFilter } from './filters/SheetDifficultyFilter'
import { SheetInternalLevelFilter } from './filters/SheetInternalLevelFilter'
import { SheetTagFilter } from './filters/SheetTagFilter'
import { SheetVersionFilter } from './filters/SheetVersionFilter'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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
/** The newest game version this build knows: saved filters from a build that knew an older one are dropped, since
 * their version list would leave the new version's charts out */
const latestKnownVersion = () => VERSION_SORT_ORDER[VERSION_SORT_ORDER.length - 1]

/**
 * The sort and filters last until the tab is closed (sessionStorage): they survive opening a chart and coming back,
 * or a reload, and a new visit starts from the defaults. They used to expire 5 minutes after the last change, which
 * reset them without a word; the trigger now shows how many are active, so a kept filter is never a surprise.
 */
const sortFilterStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

const clearPersistedSheetSortFilter = () => {
  if (typeof window === 'undefined') return
  try {
    sortFilterStorage()?.removeItem(SHEET_SORT_FILTER_STORAGE_KEY)
    // The 5-minute copy older builds kept in localStorage
    window.localStorage.removeItem(SHEET_SORT_FILTER_STORAGE_KEY)
  } catch {
    // Storage blocked: nothing persisted to clear
  }
}

const sameMembers = <T,>(a: readonly T[] | undefined, b: readonly T[]) =>
  (a ?? []).length === b.length && b.every((value) => (a ?? []).includes(value))

/** How many filter groups (and the sort, as one) differ from the defaults: the number on the trigger */
export const countActiveSortFilters = (form: SheetSortFilterForm | undefined): number => {
  if (!form) return 0
  const defaults = getDefaultSheetSortFilterForm()
  const { filters } = form
  const level = filters.internalLevelValue
  const defaultLevel = defaults.filters.internalLevelValue!
  return [
    !sameMembers(filters.versions, defaults.filters.versions),
    !!level && (level.min !== defaultLevel.min || level.max !== defaultLevel.max),
    (filters.tags ?? []).length > 0,
    !sameMembers(filters.categories, defaults.filters.categories),
    !sameMembers(filters.difficulties, defaults.filters.difficulties),
    !!filters.favoritesOnly,
    JSON.stringify(form.sorts ?? []) !== JSON.stringify(defaults.sorts),
  ].filter(Boolean).length
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

  let alreadySaved: string | null = null
  try {
    alreadySaved = sortFilterStorage()?.getItem(SHEET_SORT_FILTER_STORAGE_KEY) ?? null
    // A copy an older build left in localStorage is not carried over: it would come back on every visit
    window.localStorage.removeItem(SHEET_SORT_FILTER_STORAGE_KEY)
  } catch {
    return null
  }
  if (!alreadySaved) {
    return null
  }

  try {
    const parsed = JSON.parse(alreadySaved)
    // Checked per tab, next to the payload: a shared marker would let one tab's update skip another tab's reset
    if (parsed?.latestVersion !== latestKnownVersion()) {
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
        try {
          sortFilterStorage()?.setItem(
            SHEET_SORT_FILTER_STORAGE_KEY,
            JSON.stringify({ version: CURRENT_SCHEMA_VERSION, payload: data, latestVersion: latestKnownVersion() }),
          )
        } catch {
          // Storage full or blocked: the choice still applies to this page
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [onChange, watch])

  return null
}

const SheetSortFilterFormReset: FC<{
  onReset: () => void
}> = ({ onReset }) => {
  const locale = useLocale()
  const [openDialog, setOpenDialog] = useState(false)

  return (
    <>
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} TransitionComponent={Grow}>
        <DialogTitle>{m.sheet_sortAndFilter_reset_dialog_title({}, { locale })}</DialogTitle>
        <DialogContent>
          <DialogContentText>{m.sheet_sortAndFilter_reset_dialog_message({}, { locale })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpenDialog(false)
            }}
          >
            {m.sheet_sortAndFilter_reset_dialog_cancel({}, { locale })}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setOpenDialog(false)
              onReset()
            }}
          >
            {m.sheet_sortAndFilter_reset_dialog_confirm({}, { locale })}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resetting is undoable by hand and confirmed first, so only the dialog's confirm button is red */}
      <Button
        variant="outlined"
        color="inherit"
        className="!border-black/25"
        startIcon={<MdiRestore aria-hidden="true" />}
        onClick={() => setOpenDialog(true)}
        size="small"
      >
        {m.sheet_sortAndFilter_reset_button({}, { locale })}
      </Button>
    </>
  )
}

export const SheetSortFilterTrigger: FC<{
  expanded: boolean
  contentId: string
  onToggle: () => void
  pending?: boolean
  /** Filter groups (and the sort) changed from the defaults: shown as a count, so a kept filter is visible */
  activeCount?: number
  variant?: 'bar' | 'compact'
  className?: string
}> = ({ expanded, contentId, onToggle, pending = false, activeCount = 0, variant = 'bar', className }) => {
  const locale = useLocale()
  const activeLabel = activeCount > 0 ? m.sheet_sortAndFilter_active({ n: activeCount }, { locale }) : null
  const activeBadge = activeLabel && (
    <span
      aria-hidden
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-strong px-1 text-[11px] leading-none font-bold text-[var(--on-accent)] num"
      title={activeLabel}
    >
      {activeCount}
    </span>
  )

  if (variant === 'compact') {
    return (
      <Button
        variant="outlined"
        color="inherit"
        className={clsx(
          'relative !min-h-[56px] !min-w-[6.25rem] shrink-0 !px-3 !py-1.5 transition-[background-color,border-color] duration-150',
          '!flex !items-center !justify-center gap-1.5 !text-fg-1 backdrop-blur-[12px] backdrop-saturate-150',
          // Same material and edge as the search field beside it; open, it takes the accent tint and edge
          expanded
            ? '!border-accent-strong !bg-accent-subtle'
            : activeCount > 0
              ? '!border-accent-strong !bg-[var(--glass-thin-bg)]'
              : '!border-black/25 !bg-[var(--glass-thin-bg)] hover:!border-black/60',
          className,
        )}
        aria-label={[m.sheet_sortAndFilter_title({}, { locale }), activeLabel].filter(Boolean).join(', ')}
        aria-controls={contentId}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <MdiFilterIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="flex flex-col text-left text-xs font-semibold leading-tight">
          <span className="whitespace-nowrap">{m.sheet_filter_title({}, { locale })}</span>
          <span className="whitespace-nowrap">{m.sheet_sort_title({}, { locale })}</span>
        </span>
        <MdiChevronDownIcon
          aria-hidden="true"
          className={clsx(
            'h-4 w-4 shrink-0 motion-safe:transition-transform duration-300',
            expanded && 'transform rotate-180',
          )}
        />
        {activeBadge && <span className="absolute -right-1.5 -top-1.5">{activeBadge}</span>}
        {pending && <CircularProgress disableShrink className="absolute right-1 top-1 !h-3 !w-3" />}
      </Button>
    )
  }

  return (
    <ButtonBase
      className={clsx(
        'px-4 w-full flex items-center transition-[background-color,padding] duration-300 motion-reduce:transition-[background-color]',
        expanded ? 'bg-accent-subtle py-4' : 'hover:bg-black/4 py-3',
        className,
      )}
      aria-controls={contentId}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <div className="text-xl font-semibold leading-none">{m.sheet_sortAndFilter_title({}, { locale })}</div>
      {activeBadge && <span className="ml-2">{activeBadge}</span>}
      {activeLabel && <span className="sr-only">{activeLabel}</span>}
      {pending && <CircularProgress disableShrink className="ml-2 !h-4 !w-4" />}
      <div className="flex-1" />
      <MdiChevronDownIcon
        aria-hidden="true"
        className={clsx('w-6 h-6 motion-safe:transition-transform', expanded && 'transform rotate-180')}
      />
    </ButtonBase>
  )
}

const SheetSortFilterFormContent: FC<{
  expanded?: boolean
  contentId?: string
  onExpandedChange?: (expanded: boolean) => void
  showDefaultTrigger?: boolean
}> = ({ expanded: controlledExpanded, contentId, onExpandedChange, showDefaultTrigger = true }) => {
  const locale = useLocale()
  const { queryActive } = useContext(SheetDetailsContext)
  const { control, setValue, reset } = useFormContext<SheetSortFilterForm>()
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false)
  const [pending, startTransition] = useTransition()
  const generatedContentId = useId()
  const resolvedContentId = contentId ?? generatedContentId
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const [contentMotionVisible, setContentMotionVisible] = useState(expanded)
  // the height animates only where motion is welcome, and closes faster than it opens
  const collapseTimeout = useReducedMotion() ? 0 : { enter: 275, exit: 150 }

  useEffect(() => {
    if (!expanded) {
      setContentMotionVisible(false)
      return
    }

    const animationFrame = window.requestAnimationFrame(() => setContentMotionVisible(true))
    return () => window.cancelAnimationFrame(animationFrame)
  }, [expanded])

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

  const contentMotionClassName = clsx(
    'origin-top transition-[opacity,transform,filter] ease-[cubic-bezier(0.2,0,0,1)]',
    // the panel moves only where motion is welcome; otherwise it only fades. Closing is shorter than opening
    contentMotionVisible
      ? 'opacity-100 translate-y-0 scale-100 blur-0 duration-[275ms]'
      : 'opacity-0 motion-safe:-translate-y-1 motion-safe:scale-[0.995] motion-safe:blur-[1px] duration-150',
  )

  const collapsibleInner = (
    <div className="p-4 w-full flex flex-col gap-6">
      <section className="flex flex-col gap-4" aria-labelledby={`${resolvedContentId}-filter`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${resolvedContentId}-filter`} className="m-0 text-xl font-semibold leading-tight">
            {m.sheet_filter_title({}, { locale })}
          </h2>
          <SheetSortFilterFormReset
            onReset={() => {
              reset(getDefaultSheetSortFilterForm())
              clearPersistedSheetSortFilter()
            }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <SheetTagFilter control={control} reset={() => resetByFilter('tags')} />
          <SheetInternalLevelFilter control={control} reset={() => resetByFilter('internalLevelValue')} />
          <SheetCategoryFilter control={control} reset={() => resetByFilter('categories')} />
          <SheetDifficultyFilter control={control} reset={() => resetByFilter('difficulties')} />
          <SheetVersionFilter control={control} reset={() => resetByFilter('versions')} />
          <SheetFavoritesFilter control={control} reset={() => resetByFilter('favoritesOnly')} />
        </div>
      </section>

      <div className="h-px w-full bg-[var(--glass-border)]" />

      <section className="flex flex-col gap-4" aria-labelledby={`${resolvedContentId}-sort`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={`${resolvedContentId}-sort`} className="m-0 text-xl font-semibold leading-tight">
            {m.sheet_sort_title({}, { locale })}
          </h2>
          {queryActive && (
            <p className="m-0 inline-flex items-center gap-1 text-sm text-fg-2">
              <MdiInformationOutline aria-hidden="true" className="shrink-0" />
              {m.sheet_sort_temporarilyDisabled({}, { locale })}
            </p>
          )}
        </div>
        {/* A search orders results by relevance and ignores the sort, so the controls are inert until it is cleared */}
        <div inert={queryActive} className={clsx(queryActive && 'opacity-50')}>
          <SheetSortSelect control={control} />
        </div>
      </section>
    </div>
  )

  return (
    // Under reduced motion the sort and slider springs become instant
    <MotionConfig reducedMotion="user">
      {import.meta.env.DEV && <DevTool control={control} />}
      {showDefaultTrigger ? (
        // The page panel material, not the overlay Paper: this sits in the page flow
        <div className="glass w-full flex flex-col overflow-hidden">
          <SheetSortFilterTrigger
            expanded={expanded}
            contentId={resolvedContentId}
            onToggle={toggleExpanded}
            pending={pending}
          />

          <Collapse className="w-full" in={expanded} timeout={collapseTimeout} unmountOnExit>
            <div id={resolvedContentId} className={contentMotionClassName}>
              {collapsibleInner}
            </div>
          </Collapse>
        </div>
      ) : (
        <Collapse className="w-full" in={expanded} timeout={collapseTimeout} unmountOnExit>
          <div className="glass w-full flex flex-col overflow-hidden">
            <div id={resolvedContentId} className={contentMotionClassName}>
              {collapsibleInner}
            </div>
          </div>
        </Collapse>
      )}
    </MotionConfig>
  )
}