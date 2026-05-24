import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { Button, IconButton } from '@mui/material'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { TYPE_ORDER, getHighestDifficulty } from '../models/constants'
import { useAppContextDXDataVersion } from '../models/context/useAppContext'
import { useServerAliases } from '../models/useServerAliases'
import { type FlattenedSheet, canonicalId, getSearchAcronymsWithServerAliases } from '../songs'
import { SongHeader } from '../components/song/SongHeader'
import { SongSheetContent } from '../components/song/SongSheetContent'
import { SongSheetTabs } from '../components/song/SongSheetTabs'
import { getVisibleSongPageSheets } from './songPageSheets'

const routeApi = getRouteApi('/songs/$songId/$type/$difficulty')

export const SongPage: FC = () => {
  const { t } = useTranslation(['song'])
  const { songId, type, difficulty } = routeApi.useParams()
  const navigate = useNavigate()
  const appVersion = useAppContextDXDataVersion()
  const { data: serverAliases } = useServerAliases()

  const song = useMemo(() => {
    if (!songId) return null
    return dxdata.songs.find((s) => s.songId === songId) ?? null
  }, [songId])

  const searchAcronyms = useMemo(() => {
    if (!song) return []
    return getSearchAcronymsWithServerAliases(song, serverAliases)
  }, [song, serverAliases])

  const flattenedSheets = useMemo<FlattenedSheet[]>(() => {
    if (!song) return []
    return song.sheets.map((sheet) => {
      const isTypeUtage = sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P
      const identity = {
        songId: song.songId,
        type: sheet.type,
        difficulty: sheet.difficulty,
      }
      return {
        ...song,
        ...sheet,
        id: canonicalId(song, sheet),
        identity,
        searchAcronyms,
        isTypeUtage,
        isRatingEligible: !isTypeUtage,
        tags: [],
        releaseDateTimestamp: sheet.releaseDate ? new Date(`${sheet.releaseDate}T06:00:00+09:00`).valueOf() : 0,
        internalLevelValue: sheet.multiverInternalLevelValue
          ? (sheet.multiverInternalLevelValue[appVersion] ?? sheet.internalLevelValue)
          : sheet.internalLevelValue,
      } as FlattenedSheet
    })
  }, [song, searchAcronyms, appVersion])

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
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold">{t('song:not-found.title')}</h1>
        <p className="text-zinc-600">{t('song:not-found.description')}</p>
        <Button variant="contained" href="/search">
          {t('song:not-found.back-to-search')}
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <a
        href="/search"
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