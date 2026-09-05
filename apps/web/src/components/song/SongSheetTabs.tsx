import { type DifficultyEnum, type Sheet, TypeEnum } from '@gekichumai/dxdata'
import { Tab, Tabs } from '@mui/material'
import { type FC, type MouseEvent, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DIFFICULTIES } from '../../models/difficulties'
import { DIFFICULTY_ORDER, getHighestDifficulty } from '../../models/constants'
import { buildSheetPath } from '../sheet/sheetLinks'
import { toSupportedLocale } from '@/setup/locale'
import { getSheetTypeAltTextKey, SHEET_TYPE_TAB_IMAGES } from '../sheet/sheetTypeAssets'

export interface SongSheetTabsProps {
  songId: string
  sheets: Sheet[]
  availableTypes: readonly TypeEnum[]
  activeType: TypeEnum
  activeDifficulty: DifficultyEnum
  onTypeChange: (type: TypeEnum) => void
  onDifficultyChange: (difficulty: DifficultyEnum) => void
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
  songId,
  sheets,
  availableTypes,
  activeType,
  activeDifficulty,
  onTypeChange,
  onDifficultyChange,
}) => {
  const { t, i18n } = useTranslation(['song', 'sheet'])
  const locale = toSupportedLocale(i18n.language) ?? 'en'
  const handleNavigation = (event: MouseEvent, navigate: () => void) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate()
  }

  const difficultiesForActiveType = useMemo(() => {
    const diffSet = new Set(sheets.filter((s) => s.type === activeType).map((s) => s.difficulty))
    return DIFFICULTY_ORDER.filter((d) => diffSet.has(d))
  }, [sheets, activeType])

  return (
    <div className="flex flex-col gap-1">
      <Tabs
        value={activeType}
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
              component="a"
              href={`${buildSheetPath({ songId, type, difficulty: getHighestDifficulty(sheets.filter((sheet) => sheet.type === type)) })}?locale=${locale}`}
              onClick={(event) => handleNavigation(event, () => onTypeChange(type))}
              value={type}
              label={renderTypeTabLabel(type, label, altText)}
              classes={{
                selected: '!text-white font-bold',
                root: '!rounded-lg z-1 !py-0 !min-h-2.25rem !h-2.25rem !text-sm',
              }}
            />
          )
        })}
      </Tabs>

      <Tabs
        value={activeDifficulty}
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
              component="a"
              href={`${buildSheetPath({ songId, type: activeType, difficulty })}?locale=${locale}`}
              onClick={(event) => handleNavigation(event, () => onDifficultyChange(difficulty))}
              value={difficulty}
              label={config.title}
              classes={{
                root: '!py-0 !min-h-2rem !h-2rem !text-xs',
              }}
              style={{
                color: activeDifficulty === difficulty ? config.color : undefined,
              }}
            />
          )
        })}
      </Tabs>
    </div>
  )
}