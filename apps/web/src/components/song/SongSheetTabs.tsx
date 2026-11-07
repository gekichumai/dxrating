import { difficultyInkStyle } from '@/utils/difficultyInk'
import { type DifficultyEnum, type Sheet, TypeEnum } from '@gekichumai/dxdata'
import { Tab, Tabs } from '@mui/material'
import clsx from 'clsx'
import {
  type FC,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DIFFICULTIES } from '../../models/difficulties'
import { DIFFICULTY_ORDER, getHighestDifficulty } from '../../models/constants'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'
import { LinkBehavior } from '@/components/global/InternalLink'
import { afterNextPaint } from '@/utils/afterNextPaint'

export interface SongSheetTabsProps {
  sheets: Sheet[]
  availableTypes: readonly TypeEnum[]
  activeType: TypeEnum
  activeDifficulty: DifficultyEnum
  onTypeChange: (type: TypeEnum) => void
  /** With the type a pending type switch is going to, if any */
  onDifficultyChange: (difficulty: DifficultyEnum, type: TypeEnum) => void
  /** The chart page a tab opens: the tabs are real links so crawlers (and new-tab clicks) reach sibling charts */
  hrefFor: (type: TypeEnum, difficulty?: DifficultyEnum) => string
}

// Plain clicks switch in-app through onChange; modified clicks keep the browser's default (new tab, copy link)
const isModifiedClick = (event: SyntheticEvent) => {
  const mouse = event as MouseEvent
  return Boolean(mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey || (mouse.button ?? 0) !== 0)
}

const keepModifiedClicks = (event: MouseEvent) => {
  if (!isModifiedClick(event)) event.preventDefault()
}

// The tabs are links, which browsers activate with Enter only; the tab pattern also activates with Space
const activateOnSpace = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== ' ' || event.repeat) return
  event.preventDefault()
  event.currentTarget.click()
}

// DX and STD read as the game's own short codes; the utage kinds have no short code, so they keep their name
const TYPE_SHORT_LABELS: Partial<Record<TypeEnum, string>> = {
  [TypeEnum.STD]: 'STD',
  [TypeEnum.DX]: 'DX',
}

const TYPE_LABELS = {
  [TypeEnum.DX]: m.song_type_dx,
  [TypeEnum.STD]: m.song_type_std,
  [TypeEnum.UTAGE]: m.song_type_utage,
  [TypeEnum.UTAGE2P]: m.song_type_utage2p,
} satisfies Record<TypeEnum, PlainMessage>

const typeShortLabel = (type: TypeEnum, label: string) => TYPE_SHORT_LABELS[type] ?? label

/** A tab the visitor picked whose page is still on its way, and the chart shown when it was picked */
interface PendingChart {
  type: TypeEnum
  difficulty: DifficultyEnum | false
  from: string
  /** The song's charts, which identify the song */
  sheets: Sheet[]
}

export const SongSheetTabs: FC<SongSheetTabsProps> = ({
  sheets,
  availableTypes,
  activeType,
  activeDifficulty,
  onTypeChange,
  onDifficultyChange,
  hrefFor,
}) => {
  const locale = useLocale()

  // A tap shows its tab as selected at once, and the switch itself (a navigation that re-renders the whole page,
  // ~200ms at 4x CPU) runs after that paint: the tap's frame carries only the tabs (mobile INP)
  const shownChart = `${activeType}/${activeDifficulty}`
  const [pending, setPending] = useState<PendingChart>()
  // Once the page shows another chart or song (this one or any other), the URL's tabs are right again, and the pick
  // is done for good: a later navigation back to where it started must not bring it back
  const pendingCurrent = pending?.from === shownChart && pending.sheets === sheets
  if (pending && !pendingCurrent) setPending(undefined)
  const shownPending = pendingCurrent ? pending : undefined
  const cancelSwitch = useRef<() => void>(undefined)
  useEffect(() => () => cancelSwitch.current?.(), [])
  const switchChart = (next: Omit<PendingChart, 'from' | 'sheets'>, commit: () => void) => {
    setPending({ ...next, from: shownChart, sheets })
    cancelSwitch.current?.()
    cancelSwitch.current = afterNextPaint(commit)
  }

  const tabsType = shownPending?.type ?? activeType
  const tabsDifficulty = shownPending ? shownPending.difficulty : activeDifficulty

  const difficultiesForActiveType = useMemo(() => {
    const diffSet = new Set(sheets.filter((s) => s.type === tabsType).map((s) => s.difficulty))
    // Ascending (BASIC → Re:MASTER), as on the game's select screen and the song hub table
    return [...DIFFICULTY_ORDER].reverse().filter((d) => diffSet.has(d))
  }, [sheets, tabsType])

  const isUtageType = tabsType === TypeEnum.UTAGE || tabsType === TypeEnum.UTAGE2P
  // A lone utage chart needs no difficulty switcher: its kind is shown in the chart summary below
  const showDifficultyTabs = !(isUtageType && difficultiesForActiveType.length <= 1)

  return (
    // Type then difficulty in reading order; from sm up they share a row, with the type control at the end
    <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:gap-3 sm:border-b sm:border-solid sm:border-0 sm:border-black/8">
      {availableTypes.length > 1 ? (
        // A compact segmented control on a glass track; the selected segment is tinted, not filled
        <div className="glass-inset !rounded-[var(--radius-md)] p-0.5 self-start sm:self-center shrink-0 max-w-full">
          <Tabs
            value={tabsType}
            onChange={(event, v: TypeEnum) => {
              if (isModifiedClick(event)) return
              // The page opens a type on its highest difficulty; utage kinds have their own, which show once it has
              const highest = getHighestDifficulty(sheets.filter((sheet) => sheet.type === v))
              const difficulty = sheets.some((sheet) => sheet.type === v && sheet.difficulty === highest) && highest
              switchChart({ type: v, difficulty }, () => onTypeChange(v))
            }}
            variant="scrollable"
            scrollButtons={false}
            aria-label={m.song_typeTabsLabel({}, { locale })}
            classes={{
              root: '!min-h-8',
              scroller: 'scroll-fade-x',
              indicator:
                '!h-full !rounded-[var(--radius-sm)] !bg-accent-subtle shadow-[inset_0_0_0_1px_var(--accent)] z-0',
            }}
          >
            {availableTypes.map((type) => {
              const label = TYPE_LABELS[type]({}, { locale })
              const selected = type === tabsType
              return (
                <Tab
                  key={type}
                  value={type}
                  component={LinkBehavior}
                  href={hrefFor(type)}
                  onClick={keepModifiedClicks}
                  onKeyDown={activateOnSpace}
                  aria-label={label}
                  title={label}
                  label={typeShortLabel(type, label)}
                  classes={{
                    root: clsx(
                      '!rounded-[var(--radius-sm)] z-1 !py-0 !px-3 !min-w-12 !min-h-8 !h-8 !text-xs !tracking-wide !normal-case',
                      selected ? '!text-accent-strong !font-semibold' : '!text-fg-2 !font-medium',
                    ),
                  }}
                />
              )
            })}
          </Tabs>
        </div>
      ) : (
        availableTypes[0] && (
          // One chart type: nothing to switch, so a plain badge says which one it is
          <span
            className="glass-inset !rounded-[var(--radius-sm)] self-start sm:self-center shrink-0 px-2 py-1 text-xs font-semibold tracking-wide text-fg-2"
            title={TYPE_LABELS[availableTypes[0]]({}, { locale })}
          >
            <span aria-hidden="true">
              {typeShortLabel(availableTypes[0], TYPE_LABELS[availableTypes[0]]({}, { locale }))}
            </span>
            <span className="sr-only">{TYPE_LABELS[availableTypes[0]]({}, { locale })}</span>
          </span>
        )
      )}

      {showDifficultyTabs && (
        <Tabs
          value={tabsDifficulty}
          onChange={(event, v: DifficultyEnum) => {
            if (isModifiedClick(event)) return
            switchChart({ type: tabsType, difficulty: v }, () => onDifficultyChange(v, tabsType))
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={m.song_difficultyTabsLabel({}, { locale })}
          classes={{
            root: '!min-h-2.5rem min-w-0 flex-1 border-b border-solid border-0 border-black/8 sm:border-b-0',
            scroller: 'scroll-fade-x',
          }}
          TabIndicatorProps={{
            style: {
              backgroundColor: tabsDifficulty ? DIFFICULTIES[tabsDifficulty]?.color : undefined,
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          {difficultiesForActiveType.map((difficulty) => {
            const config = DIFFICULTIES[difficulty]
            const selected = tabsDifficulty === difficulty
            return (
              <Tab
                key={difficulty}
                value={difficulty}
                component={LinkBehavior}
                href={hrefFor(tabsType, difficulty)}
                onClick={keepModifiedClicks}
                onKeyDown={activateOnSpace}
                label={config?.title ?? difficulty}
                classes={{
                  root: clsx(
                    // 8px sides below sm: all five difficulties, Re:MASTER included, fit a 390px phone; narrower screens
                    // scroll the row behind its edge fade
                    '!py-0 !min-h-2.5rem !h-2.5rem !min-w-0 !px-2 sm:!px-3 !text-xs !tracking-wide',
                    selected ? '!font-semibold' : '!text-fg-2',
                  ),
                }}
                // Light: the darkened ink (>=4.5:1 on glass); dark swaps in inkDark (!important beats the inline value)
                className={selected ? 'dark:!text-[var(--difficulty-ink-dark)]' : undefined}
                style={selected && config ? { ...difficultyInkStyle(difficulty), color: config.ink } : undefined}
              />
            )
          })}
        </Tabs>
      )}
    </div>
  )
}