import type { VersionEnum } from '@gekichumai/dxdata'
import clsx from 'clsx'
import {
  type ButtonHTMLAttributes,
  type FC,
  forwardRef,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import MdiCheck from '~icons/mdi/check'
import MdiChevronDown from '~icons/mdi/chevron-down'
import { ResponsiveDialog } from '../global/ResponsiveDialog'
import { VersionLogo } from './VersionLogo'
import { VersionEraPager, VersionPairGrid } from './VersionPairList'
import { VERSION_ERAS, type VersionEra, pairVersions, pairVersionsByEra, versionEraOf } from './versionEras'

/** One choice in the picker. `key` tells apart two choices with the same version (one per region, say) */
export interface VersionPickerOption {
  key: string
  version: VersionEnum
  selected: boolean
  /** A second line under the logo, such as the region */
  description?: ReactNode
}

const TILE_SELECTOR = '[data-version-tile]'

/** Moves focus between tiles: left and right in reading order, up and down to the nearest tile in that direction */
function moveTileFocus(event: KeyboardEvent<HTMLElement>) {
  const key = event.key
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return
  const current = (event.target as HTMLElement).closest<HTMLElement>(TILE_SELECTOR)
  if (!current) return
  // Hidden era pages are not in the layout, so their tiles have no box
  // Every list of the picker, so focus runs on from the regional releases into the pairs
  const root = event.currentTarget.closest<HTMLElement>('[data-version-picker]') ?? event.currentTarget
  const tiles = [...root.querySelectorAll<HTMLElement>(TILE_SELECTOR)].filter((tile) => !tile.closest('[hidden]'))
  const index = tiles.indexOf(current)
  if (index < 0) return
  event.preventDefault()
  const rtl = getComputedStyle(current).direction === 'rtl'

  let next: HTMLElement | undefined
  if (key === 'Home') next = tiles[0]
  else if (key === 'End') next = tiles.at(-1)
  else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const forward = (key === 'ArrowRight') !== rtl
    next = tiles[index + (forward ? 1 : -1)]
  } else {
    const down = key === 'ArrowDown'
    const from = current.getBoundingClientRect()
    let best = Number.POSITIVE_INFINITY
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect()
      const dy = down ? rect.top - from.bottom : from.top - rect.bottom
      if (dy < -1) continue
      if (tile === current || (rect.top === from.top && rect.height > 0)) continue
      const score = dy * 4 + Math.abs(rect.left + rect.width / 2 - (from.left + from.width / 2))
      if (score < best) {
        best = score
        next = tile
      }
    }
    // Without a layout (tests), pairs are two to a row
    if (from.height === 0) next = tiles[index + (down ? 2 : -2)]
  }
  next?.focus()
}

/**
 * A version tile: its logo (or its name set as a plate, for the classic cabinets), an optional second line, and a
 * check badge with an accent ring when selected, so the selection never rests on colour alone.
 */
const VersionPickerTile: FC<{
  option: VersionPickerOption
  tabStop: boolean
  onPick: (option: VersionPickerOption) => void
}> = ({ option, tabStop, onPick }) => (
  <button
    type="button"
    // A button for the click, Enter and Space it brings; an option of the list for its selected state
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    role="option"
    aria-selected={option.selected}
    data-version-tile=""
    data-selected={option.selected || undefined}
    tabIndex={tabStop ? 0 : -1}
    title={option.version}
    onClick={() => onPick(option)}
    className={clsx(
      'relative flex w-full min-w-0 flex-col items-stretch gap-1 rounded-[var(--radius-md)] border-0 px-2 py-1.5 font-inherit text-start cursor-pointer',
      'transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
      option.selected
        ? 'glass-thin !bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] shadow-[inset_0_0_0_2px_var(--accent)]'
        : 'glass-inset text-fg-1 hover:bg-surface/70',
    )}
  >
    <VersionLogo version={option.version} decorative={false} className="h-10 max-w-full self-center text-xs" />
    {option.description && (
      <span className={clsx('truncate text-center text-xs', option.selected ? 'text-fg-1 font-semibold' : 'text-fg-2')}>
        {option.description}
      </span>
    )}
    <span
      aria-hidden
      className={clsx(
        'absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full bg-accent-strong text-on-accent shadow-sm transition-[opacity,scale] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        option.selected ? 'opacity-100 scale-100' : 'opacity-0 scale-75',
      )}
    >
      <MdiCheck className="size-3.5" />
    </span>
  </button>
)

/** The tab stop of a group of tiles: its first selected tile, else its first */
const tabStopKey = (options: readonly VersionPickerOption[]) => (options.find((o) => o.selected) ?? options[0])?.key

const VersionTileList: FC<{
  label: string
  multiple: boolean
  options: VersionPickerOption[]
  onPick: (option: VersionPickerOption) => void
  paired: boolean
  era?: VersionEra
}> = ({ label, multiple, options, onPick, paired, era }) => {
  const stop = tabStopKey(options)
  const byVersion = new Map(options.map((option) => [option.version, option]))
  const tile = (option: VersionPickerOption) => (
    <VersionPickerTile key={option.key} option={option} tabStop={option.key === stop} onPick={onPick} />
  )

  return (
    // A listbox of buttons: <select> cannot hold logos
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} onKeyDown={moveTileFocus}>
      {paired && era ? (
        <VersionPairGrid
          presentational
          className="gap-2 sm:grid-cols-2 sm:gap-x-4"
          pairs={pairVersionsByEra([...byVersion.keys()], era)}
          renderVersion={(version) => tile(byVersion.get(version)!)}
        />
      ) : (
        <ul role="none" className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
          {options.map((option) => (
            <li key={option.key} role="none" className="min-w-0">
              {tile(option)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The one way to choose game versions, everywhere on the site. It opens as a bottom sheet on phones and a dialog on
 * larger screens, with the versions in rows of two (the base version on the left, its PLUS on the right) on a でらっくす
 * page and a classic page, opening on the page of the current selection.
 *
 * Single choice (`multiple` unset): picking a tile calls `onPick`, and the caller closes the picker. Multiple choice:
 * tiles toggle, with select-all and clear; the caller keeps the draft and applies it when the picker closes.
 */
export const VersionPicker: FC<{
  open: boolean
  onClose: () => void
  title: string
  options: VersionPickerOption[]
  onPick: (option: VersionPickerOption) => void
  multiple?: boolean
  onSelectAll?: () => void
  onClear?: () => void
  /** Choices shown above the paired pages, not paired (the regional releases) */
  featured?: { title: string; options: VersionPickerOption[] }
  /** The heading of the paired pages when there are featured choices above them */
  pagesTitle?: string
  /** A note under the choices */
  footnote?: ReactNode
}> = ({ open, onClose, title, ...props }) => (
  <ResponsiveDialog open={open} setOpen={(next) => !next && onClose()} title={title} maxWidth="sm" drawerHeight="auto">
    {() => <VersionPickerContent {...props} onClose={onClose} />}
  </ResponsiveDialog>
)

const VersionPickerContent: FC<{
  options: VersionPickerOption[]
  onPick: (option: VersionPickerOption) => void
  onClose: () => void
  multiple?: boolean
  onSelectAll?: () => void
  onClear?: () => void
  featured?: { title: string; options: VersionPickerOption[] }
  pagesTitle?: string
  footnote?: ReactNode
}> = ({ options, onPick, onClose, multiple = false, onSelectAll, onClear, featured, pagesTitle, footnote }) => {
  const { t } = useTranslation(['versions'])
  const root = useRef<HTMLDivElement>(null)
  const pagesTitleId = useId()

  const eras = useMemo(
    () => VERSION_ERAS.filter((era) => options.some((option) => versionEraOf(option.version) === era)),
    [options],
  )
  // Open on the page that holds the selection (a featured choice counts too); the newer page wins a tie
  const defaultEra = useMemo(() => {
    const selected = [...(featured?.options ?? []), ...options].filter((option) => option.selected)
    return eras.find((era) => selected.some((option) => versionEraOf(option.version) === era)) ?? eras[0]
  }, [featured, options, eras])

  // Focus starts on the selected tile, so arrows and Enter work at once and the tile is scrolled into view
  useEffect(() => {
    const visible = [...(root.current?.querySelectorAll<HTMLElement>(TILE_SELECTOR) ?? [])].filter(
      (tile) => !tile.closest('[hidden]'),
    )
    ;(visible.find((tile) => tile.dataset.selected !== undefined) ?? visible[0])?.focus({ preventScroll: false })
  }, [])

  const selectedCount = options.filter((option) => option.selected).length
  const badges = multiple
    ? Object.fromEntries(
        eras.map((era) => {
          const inEra = options.filter((option) => versionEraOf(option.version) === era)
          return [era, `${inEra.filter((option) => option.selected).length}/${inEra.length}`]
        }),
      )
    : undefined

  const page = (era: VersionEra) => (
    <VersionTileList
      label={t(`versions:era.${era}`)}
      multiple={multiple}
      options={options.filter((option) => versionEraOf(option.version) === era)}
      onPick={onPick}
      paired
      era={era}
    />
  )

  return (
    <div ref={root} data-version-picker="" className="flex flex-col gap-4">
      {featured && featured.options.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold text-fg-2">{featured.title}</h3>
          <VersionTileList
            label={featured.title}
            multiple={multiple}
            options={featured.options}
            onPick={onPick}
            paired={false}
          />
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby={pagesTitle ? pagesTitleId : undefined}>
        {pagesTitle && (
          <h3 id={pagesTitleId} className="m-0 text-sm font-semibold text-fg-2 text-pretty">
            {pagesTitle}
          </h3>
        )}
        {eras.length > 1 ? (
          <VersionEraPager label={t('versions:era.label')} defaultEra={defaultEra} badges={badges}>
            {page}
          </VersionEraPager>
        ) : (
          eras[0] && page(eras[0])
        )}
      </section>

      {footnote}

      {multiple && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] bg-surface/80 p-1 backdrop-blur-md">
          <output className="w-full px-1 text-xs text-fg-2 num" aria-live="polite">
            {t('versions:picker.selected-count', { count: selectedCount, total: options.length })}
          </output>
          <button type="button" className={PICKER_TEXT_BUTTON} onClick={onSelectAll}>
            {t('versions:picker.select-all')}
          </button>
          <button type="button" className={PICKER_TEXT_BUTTON} onClick={onClear} disabled={selectedCount === 0}>
            {t('versions:picker.clear')}
          </button>
          <button
            type="button"
            className="ms-auto min-h-10 cursor-pointer rounded-[var(--radius-md)] border-0 bg-accent-strong px-4 font-inherit text-sm font-semibold text-on-accent"
            onClick={onClose}
          >
            {t('versions:picker.done')}
          </button>
        </div>
      )}
    </div>
  )
}

const PICKER_TEXT_BUTTON =
  'min-h-10 cursor-pointer rounded-[var(--radius-md)] border border-solid border-[var(--glass-border)] bg-surface/40 px-3 font-inherit text-sm text-fg-1 hover:bg-surface/70 disabled:cursor-default disabled:opacity-50'

/**
 * Opens a version picker: what is chosen now (a logo, or a few) and a ▾. A real button with a 44px hit area; it says
 * it opens a dialog and whether it is open.
 */
export const VersionPickerTrigger = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { expanded: boolean; chevronClassName?: string }
>(({ expanded, className, chevronClassName, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-haspopup="dialog"
    aria-expanded={expanded}
    {...props}
    className={clsx(
      'relative inline-flex min-h-11 cursor-pointer items-center gap-2 border-0 font-inherit text-fg-1 text-start',
      className,
    )}
  >
    {children}
    <MdiChevronDown aria-hidden className={clsx('size-5 shrink-0 text-fg-2', chevronClassName)} />
  </button>
))
VersionPickerTrigger.displayName = 'VersionPickerTrigger'

/**
 * What a multiple-choice trigger shows: "All versions" when nothing is left out, else the logos of the first few
 * chosen versions and how many more.
 */
export const VersionSelectionSummary: FC<{ selected: readonly VersionEnum[]; all: boolean; allLabel: string }> = ({
  selected,
  all,
  allLabel,
}) => {
  const { t } = useTranslation(['versions'])
  if (all) return <span className="text-sm font-medium">{allLabel}</span>
  if (selected.length === 0) return <span className="text-sm text-fg-2">{t('versions:picker.none')}</span>
  // Two logos on phones and three from sm up, so the logos, the count and the chevron never overlap at 320px. Both
  // counts render and CSS picks one, which keeps SSR and the first client render identical.
  const shown = selected.slice(0, 3)
  const more = (visible: number) =>
    selected.length > visible ? t('versions:picker.more', { count: selected.length - visible }) : null
  const phoneMore = more(2)
  const wideMore = more(3)
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {shown.map((version, index) => (
          <span key={version} className={clsx('shrink-0', index === 2 ? 'hidden sm:flex' : 'flex')}>
            <VersionLogo version={version} decorative className="h-7 text-[0.5625rem]" />
          </span>
        ))}
      </span>
      {phoneMore && <span className="shrink-0 text-sm text-fg-2 num sm:hidden">{phoneMore}</span>}
      {wideMore && <span className="hidden shrink-0 text-sm text-fg-2 num sm:inline">{wideMore}</span>}
    </span>
  )
}

const isDefined = <T,>(value: T | null | undefined): value is T => value != null

/**
 * A version filter: a trigger with the current choice that opens the multiple-choice picker. Changes are a draft
 * until the picker closes, so "clear, then pick a few" never empties the list behind it; the caller gets the draft and
 * decides what an empty or a complete choice means.
 */
export const VersionMultiSelect: FC<{
  /** The versions on offer, in any order */
  available: readonly VersionEnum[]
  /** The versions chosen now; versions not on offer are ignored */
  value: readonly VersionEnum[]
  onChange: (value: VersionEnum[]) => void
  /** Names the trigger and the picker */
  label: string
  allLabel: string
  className?: string
}> = ({ available, value, onChange, label, allLabel, className }) => {
  const { t } = useTranslation(['versions'])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<VersionEnum[]>([])

  const chosen = useMemo(() => available.filter((version) => value.includes(version)), [available, value])
  const all = chosen.length === available.length
  // Newest first, each PLUS before its base, like the lists
  const summary = useMemo(
    () => pairVersions(chosen).flatMap((pair) => [pair.plus, pair.base].filter(isDefined)),
    [chosen],
  )

  const openPicker = () => {
    setDraft(chosen)
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    if (draft.length !== chosen.length || draft.some((version) => !chosen.includes(version))) onChange(draft)
  }

  const options = available.map((version) => ({ key: version, version, selected: draft.includes(version) }))
  const current = all ? allLabel : chosen.length === 0 ? t('versions:picker.none') : summary.join(', ')

  return (
    <>
      <VersionPickerTrigger
        expanded={open}
        onClick={openPicker}
        aria-label={`${label}: ${current}`}
        className={clsx(
          'glass-inset w-full max-w-sm justify-between px-3 py-1.5 transition-colors duration-[var(--duration-fast)] hover:bg-surface/70',
          className,
        )}
      >
        <VersionSelectionSummary selected={summary} all={all} allLabel={allLabel} />
      </VersionPickerTrigger>
      <VersionPicker
        open={open}
        onClose={close}
        title={label}
        multiple
        options={options}
        onPick={(option) =>
          setDraft((list) =>
            list.includes(option.version)
              ? list.filter((version) => version !== option.version)
              : [...list, option.version],
          )
        }
        onSelectAll={() => setDraft([...available])}
        onClear={() => setDraft([])}
      />
    </>
  )
}