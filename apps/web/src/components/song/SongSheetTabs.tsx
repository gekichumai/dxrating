import { difficultyInkClassName, difficultyInkStyle } from '@/utils/difficultyInk'
import clsx from 'clsx'
import { type DifficultyEnum, type Sheet, TypeEnum } from '@gekichumai/dxdata'
import { Tab, Tabs } from '@mui/material'
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
    return DIFFICULTY_ORDER.filter((d) => diffSet.has(d))
  }, [sheets, activeType])

  return (
    <div className="flex flex-col gap-1">
      <Tabs
        value={activeType}
        onChange={(event, v) => {
          if (isModifiedClick(event)) return
          onTypeChange(v)
        }}
        variant="scrollable"
        scrollButtons="auto"
        classes={{
          root: '!min-h-2.25rem',
          indicator: '!h-full !rounded-lg z-0',
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
                selected: '!text-white font-bold dark:!text-[var(--on-accent)]',
                root: '!rounded-lg z-1 !py-0 !min-h-2.25rem !h-2.25rem !text-sm',
              }}
            />
          )
        })}
      </Tabs>

      <Tabs
        value={activeDifficulty}
        onChange={(event, v) => {
          if (isModifiedClick(event)) return
          onDifficultyChange(v)
        }}
        variant="scrollable"
        scrollButtons="auto"
        classes={{
          root: '!min-h-2rem',
        }}
        TabIndicatorProps={{
          style: {
            backgroundColor: DIFFICULTIES[activeDifficulty as DifficultyEnum]?.color,
          },
        }}
      >
        {difficultiesForActiveType.map((difficulty) => {
          const config = DIFFICULTIES[difficulty]
          return (
            <Tab
              key={difficulty}
              value={difficulty}
              component="a"
              href={hrefFor(activeType, difficulty)}
              onClick={keepModifiedClicks}
              label={config.title}
              classes={{
                root: clsx(
                  '!py-0 !min-h-2rem !h-2rem !text-xs',
                  activeDifficulty === difficulty && difficultyInkClassName,
                ),
              }}
              style={activeDifficulty === difficulty ? difficultyInkStyle(difficulty) : undefined}
            />
          )
        })}
      </Tabs>
    </div>
  )
}