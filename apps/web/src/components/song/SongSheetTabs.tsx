import { difficultyInkStyle } from '@/utils/difficultyInk'
import { type DifficultyEnum, type Sheet, TypeEnum } from '@gekichumai/dxdata'
import { Tab, Tabs } from '@mui/material'
import clsx from 'clsx'
import { type FC, type MouseEvent, type SyntheticEvent, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DIFFICULTIES } from '../../models/difficulties'
import { DIFFICULTY_ORDER } from '../../models/constants'
import { getSheetTypeAltTextKey, SHEET_TYPE_TAB_IMAGES } from '../sheet/sheetTypeAssets'

export interface SongSheetTabsProps {
  sheets: Sheet[]
  availableTypes: readonly TypeEnum[]
  activeType: TypeEnum
  activeDifficulty: DifficultyEnum
  onTypeChange: (type: TypeEnum) => void
  onDifficultyChange: (difficulty: DifficultyEnum) => void
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

const renderTypeTabLabel = (type: TypeEnum, label: string, altText: string) => {
  const image = SHEET_TYPE_TAB_IMAGES[type]
  if (!image) return <span>{label}</span>

  return (
    <span className="inline-flex h-6 min-w-18 items-center justify-center px-1">
      <img
        src={image}
        alt={altText}
        className="h-22px max-w-70px object-contain touch-callout-none"
        draggable={false}
      />
    </span>
  )
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
  const { t } = useTranslation(['song', 'sheet'])

  const difficultiesForActiveType = useMemo(() => {
    const diffSet = new Set(sheets.filter((s) => s.type === activeType).map((s) => s.difficulty))
    // Ascending (BASIC → Re:MASTER), as on the game's select screen and the song hub table
    return [...DIFFICULTY_ORDER].reverse().filter((d) => diffSet.has(d))
  }, [sheets, activeType])

  const isUtageType = activeType === TypeEnum.UTAGE || activeType === TypeEnum.UTAGE2P
  // A lone utage chart needs no difficulty switcher: its kind is shown in the chart summary below
  const showDifficultyTabs = !(isUtageType && difficultiesForActiveType.length <= 1)

  return (
    <div className="flex flex-col gap-2">
      <div className="glass-inset rounded-[var(--radius-lg)] p-1 self-start max-w-full">
        <Tabs
          value={activeType}
          onChange={(event, v) => {
            if (isModifiedClick(event)) return
            onTypeChange(v)
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={t('song:type-tabs-label')}
          classes={{
            root: '!min-h-2.25rem',
            indicator: '!h-full !rounded-[var(--radius-md)] z-0',
          }}
        >
          {availableTypes.map((type) => {
            const label = t(`song:type.${type}`)
            const altText = t(getSheetTypeAltTextKey(type))
            return (
              <Tab
                key={type}
                value={type}
                component="a"
                href={hrefFor(type)}
                onClick={keepModifiedClicks}
                label={renderTypeTabLabel(type, label, altText)}
                classes={{
                  root: clsx(
                    '!rounded-[var(--radius-md)] z-1 !py-0 !min-h-2.25rem !h-2.25rem !text-sm',
                    type === activeType ? '!text-on-accent !font-semibold' : '!text-fg-1',
                  ),
                }}
              />
            )
          })}
        </Tabs>
      </div>

      {showDifficultyTabs && (
        <Tabs
          value={activeDifficulty}
          onChange={(event, v) => {
            if (isModifiedClick(event)) return
            onDifficultyChange(v)
          }}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={t('song:difficulty-tabs-label')}
          classes={{
            root: '!min-h-2.5rem border-b border-solid border-0 border-black/8',
          }}
          TabIndicatorProps={{
            style: {
              backgroundColor: DIFFICULTIES[activeDifficulty as DifficultyEnum]?.color,
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          {difficultiesForActiveType.map((difficulty) => {
            const config = DIFFICULTIES[difficulty]
            const selected = activeDifficulty === difficulty
            return (
              <Tab
                key={difficulty}
                value={difficulty}
                component="a"
                href={hrefFor(activeType, difficulty)}
                onClick={keepModifiedClicks}
                label={config?.title ?? difficulty}
                classes={{
                  root: clsx(
                    '!py-0 !min-h-2.5rem !h-2.5rem !min-w-0 !px-3 !text-xs !tracking-wide',
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