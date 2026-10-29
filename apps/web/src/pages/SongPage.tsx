import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { IconButton } from '@mui/material'
import { type FC, useMemo } from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { NotFoundContent } from '@/components/global/NotFoundContent'
import { TYPE_ORDER, getHighestDifficulty } from '../models/constants'
import { useServerAliases } from '../models/useServerAliases'
import { useCatalogDocument, useSongCatalog } from '@/catalog/CatalogContext'
import { findSongById } from '@/catalog/songLookup'
import { type FlattenedSheet, getSearchAcronymsWithServerAliases } from '../songs'
import { SongHeader } from '../components/song/SongHeader'
import { SongSheetContent } from '../components/song/SongSheetContent'
import { SongSheetTabs } from '../components/song/SongSheetTabs'
import { sheetReleaseDateTimestamp } from '../utils/dateFormatting'
import { getVisibleSongPageSheets } from './songPageSheets'

const routeApi = getRouteApi('/songs/$songId/$type/$difficulty')

export const SongPage: FC = () => {
  const { songId, type, difficulty } = routeApi.useParams()
  const navigate = useNavigate()
  const catalogDocument = useCatalogDocument()
  const catalog = useSongCatalog()
  const { data: serverAliases } = useServerAliases()

  const song = useMemo(() => {
    if (!songId) return null
    return findSongById(catalogDocument, songId) ?? null
  }, [catalogDocument, songId])

  const searchAcronyms = useMemo(() => {
    if (!song) return []
    return getSearchAcronymsWithServerAliases({ songId: song.id, searchAcronyms: song.searchAcronyms }, serverAliases)
  }, [song, serverAliases])

  const flattenedSheets = useMemo<FlattenedSheet[]>(() => {
    if (!song) return []
    return song.sheets.flatMap((sheet) => {
      const versioned = catalog.getById(sheet.id)
      if (!versioned) return []
      return [
        {
          ...versioned,
          difficulty: versioned.difficulty as DifficultyEnum,
          searchAcronyms,
          tags: [],
          releaseDateTimestamp: sheetReleaseDateTimestamp(sheet.releaseDate),
        },
      ]
    })
  }, [song, catalog, searchAcronyms])

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
      />

      {visibleSheets.map((sheet) => (
        <div key={sheet.id}>
          <SongSheetContent sheet={sheet} isActive />
        </div>
      ))}
    </div>
  )
}