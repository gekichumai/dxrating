import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { type FC, useMemo } from 'react'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import { NotFoundContent } from '@/components/global/NotFoundContent'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { TYPE_ORDER, getHighestDifficulty } from '../models/constants'
import { SongBackLink } from '../components/song/SongBackLink'
import { SongHeader } from '../components/song/SongHeader'
import { SongSheetContent, SongSheetSummary } from '../components/song/SongSheetContent'
import { SongSheetTabs } from '../components/song/SongSheetTabs'
import { constantTableLevelOf, constantTablePath } from '@/components/chartDiscovery/constantTables'
import { versionPagePath, versionSlug } from '@/components/chartDiscovery/versionPages'
import { keepLocaleSearch, withLocaleQuery } from '@/setup/locale'
import { buildSheetPath } from '../components/sheet/sheetLinks'
import { getVisibleSongPageSheets } from './songPageSheets'
import { useSongSheets } from './useSongSheets'
import { ToleranceCalculator } from '@/components/tools/ToleranceCalculator'
import { InternalLink, LinkBehavior } from '@/components/global/InternalLink'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const routeApi = getRouteApi('/songs/$songId/$type/$difficulty')

export const SongPage: FC = () => {
  const { songId, type, difficulty } = routeApi.useParams()
  // Switching charts stays on the URL's language variant (each `?locale=` variant is its own canonical page)
  const search = routeApi.useSearch()
  const localeSearch = keepLocaleSearch(search)
  const navigate = useNavigate()
  const locale = useLocale()
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
      ...localeSearch,
      // The chart tabs switch within one page: replacing the entry keeps Back (and the back arrow) leaving the song
      replace: true,
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
      ...localeSearch,
      // The chart tabs switch within one page: replacing the entry keeps Back (and the back arrow) leaving the song
      replace: true,
    })
  }

  if (!song) {
    return <NotFoundContent />
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-global flex flex-col gap-4">
      <SongBackLink search={search} className="self-start -ml-2 -mb-2" />

      {headerSheet && <SongHeader sheet={headerSheet} />}

      <MaterialSurface
        as="section"
        className="p-3 flex flex-col gap-3"
        aria-label={m.song_chartSectionLabel({}, { locale })}
      >
        <SongSheetTabs
          sheets={song.sheets}
          availableTypes={availableTypes}
          activeType={activeType}
          activeDifficulty={activeDifficulty}
          onTypeChange={handleTypeChange}
          onDifficultyChange={handleDifficultyChange}
          hrefFor={(sheetType, sheetDifficulty) =>
            withLocaleQuery(
              buildSheetPath({
                songId,
                type: sheetType,
                difficulty:
                  sheetDifficulty ?? getHighestDifficulty(flattenedSheets.filter((s) => s.type === sheetType)),
              }),
              search,
            )
          }
        />

        {visibleSheets.map((sheet) => (
          <SongSheetSummary key={sheet.id} sheet={sheet} />
        ))}

        <Link to="/songs/$songId" params={{ songId: song.id }} {...localeSearch} className="link self-start text-sm">
          {m.song_hub_allChartsLink({}, { locale })}
          <span aria-hidden> →</span>
        </Link>
      </MaterialSurface>

      {visibleSheets.map((sheet) => (
        <SongSheetContent key={sheet.id} sheet={sheet} isActive />
      ))}

      {activeSheet && <ToleranceCalculator key={activeSheet.id} sheet={activeSheet} source="chart_page" />}

      {(constantTableLevel || (activeSheet && versionSlug(activeSheet.version))) && (
        <nav className="flex flex-col gap-2 text-sm" aria-label={m.song_relatedPages({}, { locale })}>
          {constantTableLevel && (
            <InternalLink href={constantTablePath(constantTableLevel)} className="link self-start">
              {m.constants_chartLink({ level: constantTableLevel }, { locale })}
              <span aria-hidden> →</span>
            </InternalLink>
          )}

          {activeSheet && versionSlug(activeSheet.version) && (
            <InternalLink href={versionPagePath(activeSheet.version)} className="link self-start">
              {m.versions_chartLink({ version: activeSheet.version }, { locale })}
              <span aria-hidden> →</span>
            </InternalLink>
          )}
        </nav>
      )}
    </div>
  )
}