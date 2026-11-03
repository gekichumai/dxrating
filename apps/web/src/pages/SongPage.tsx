import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { IconButton } from '@mui/material'
import { type FC, useMemo } from 'react'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { NotFoundContent } from '@/components/global/NotFoundContent'
import { TYPE_ORDER, getHighestDifficulty } from '../models/constants'
import { SongHeader } from '../components/song/SongHeader'
import { SongSheetContent } from '../components/song/SongSheetContent'
import { SongSheetTabs } from '../components/song/SongSheetTabs'
import { constantTableLevelOf, constantTablePath } from '@/components/chartDiscovery/constantTables'
import { versionPagePath, versionSlug } from '@/components/chartDiscovery/versionPages'
import { useTranslation } from 'react-i18next'
import { buildSheetPath } from '../components/sheet/sheetLinks'
import { getVisibleSongPageSheets } from './songPageSheets'
import { useSongSheets } from './useSongSheets'
import { ToleranceCalculator } from '@/components/tools/ToleranceCalculator'

const routeApi = getRouteApi('/songs/$songId/$type/$difficulty')

export const SongPage: FC = () => {
  const { songId, type, difficulty } = routeApi.useParams()
  const navigate = useNavigate()
  const { t } = useTranslation(['constants', 'versions', 'song'])
  const { song, flattenedSheets } = useSongSheets(songId)

  const availableTypes = useMemo(() => {
    const typeSet = new Set(flattenedSheets.map((s) => s.type))
    return TYPE_ORDER.filter((type) => typeSet.has(type))
  }, [flattenedSheets])

  const activeType = type as TypeEnum
  const activeDifficulty = difficulty as DifficultyEnum
  const activeSheet = flattenedSheets.find(
    (sheet) => sheet.type === activeType && sheet.difficulty === activeDifficulty,
  )
  const headerSheet = activeSheet ?? flattenedSheets[0]
  const constantTableLevel = activeSheet ? constantTableLevelOf(activeSheet.level) : null
  const visibleSheets = getVisibleSongPageSheets(flattenedSheets, activeType, activeDifficulty)

  const handleTypeChange = (newType: TypeEnum) => {
    const sheetsOfType = flattenedSheets.filter((s) => s.type === newType)
    navigate({
      to: '/songs/$songId/$type/$difficulty',
      params: {
        songId,
        type: newType,
        difficulty: getHighestDifficulty(sheetsOfType),
      },
    })
  }

  const handleDifficultyChange = (newDifficulty: DifficultyEnum) => {
    navigate({
      to: '/songs/$songId/$type/$difficulty',
      params: {
        songId,
        type: activeType,
        difficulty: newDifficulty,
      },
    })
  }

  if (!song) {
    return <NotFoundContent />
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <a
        href="/"
        onClick={(e) => {
          if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
            e.preventDefault()
            window.history.back()
          }
        }}
        className="self-start -ml-2 no-underline text-inherit"
      >
        <IconButton component="span" size="small">
          <MdiArrowLeft />
        </IconButton>
      </a>

      {headerSheet && <SongHeader sheet={headerSheet} />}

      <SongSheetTabs
        sheets={song.sheets}
        availableTypes={availableTypes}
        activeType={activeType}
        activeDifficulty={activeDifficulty}
        onTypeChange={handleTypeChange}
        onDifficultyChange={handleDifficultyChange}
        hrefFor={(sheetType, sheetDifficulty) =>
          buildSheetPath({
            songId,
            type: sheetType,
            difficulty: sheetDifficulty ?? getHighestDifficulty(flattenedSheets.filter((s) => s.type === sheetType)),
          })
        }
      />

      <Link to="/songs/$songId" params={{ songId: song.id }} className="self-start text-sm text-slate-700">
        {t('song:hub.all-charts-link')} →
      </Link>

      {visibleSheets.map((sheet) => (
        <div key={sheet.id}>
          <SongSheetContent sheet={sheet} isActive />
        </div>
      ))}

      {activeSheet && <ToleranceCalculator key={activeSheet.id} sheet={activeSheet} source="chart_page" />}

      {constantTableLevel && (
        <a href={constantTablePath(constantTableLevel)} className="self-start text-sm text-slate-700">
          {t('constants:chart-link', { level: constantTableLevel })} →
        </a>
      )}

      {activeSheet && versionSlug(activeSheet.version) && (
        <a href={versionPagePath(activeSheet.version)} className="self-start text-sm text-slate-700">
          {t('versions:chart-link', { version: activeSheet.version })} →
        </a>
      )}
    </div>
  )
}