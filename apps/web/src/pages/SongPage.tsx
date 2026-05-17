import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { Button, IconButton } from '@mui/material'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { TYPE_ORDER, getHighestDifficulty } from '../models/constants'
import { useAppContextDXDataVersion } from '../models/context/useAppContext'
import { type FlattenedSheet, canonicalId } from '../songs'
import { SongHeader } from '../components/song/SongHeader'
import { SongSheetContent } from '../components/song/SongSheetContent'
import { SongSheetTabs } from '../components/song/SongSheetTabs'

const routeApi = getRouteApi('/$songId/$type/$difficulty')

export const SongPage: FC = () => {
  const { t } = useTranslation(['song'])
  const { songId, type, difficulty } = routeApi.useParams()
  const navigate = useNavigate()
  const appVersion = useAppContextDXDataVersion()

  const song = useMemo(() => {
    if (!songId) return null
    return dxdata.songs.find((s) => s.songId === songId) ?? null
  }, [songId])

  const flattenedSheets = useMemo<FlattenedSheet[]>(() => {
    if (!song) return []
    return song.sheets.map((sheet) => {
      const isTypeUtage = sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P
      return {
        ...song,
        ...sheet,
        id: canonicalId(song, sheet),
        searchAcronyms: song.searchAcronyms,
        isTypeUtage,
        isRatingEligible: !isTypeUtage,
        releaseDateTimestamp: sheet.releaseDate ? new Date(`${sheet.releaseDate}T06:00:00+09:00`).valueOf() : 0,
        internalLevelValue: sheet.multiverInternalLevelValue
          ? (sheet.multiverInternalLevelValue[appVersion] ?? sheet.internalLevelValue)
          : sheet.internalLevelValue,
      } as FlattenedSheet
    })
  }, [song, appVersion])

  const availableTypes = useMemo(() => {
    const typeSet = new Set(flattenedSheets.map((s) => s.type))
    return TYPE_ORDER.filter((type) => typeSet.has(type))
  }, [flattenedSheets])

  const activeType = type as TypeEnum
  const activeDifficulty = difficulty as DifficultyEnum

  const handleTypeChange = (newType: TypeEnum) => {
    const sheetsOfType = flattenedSheets.filter((s) => s.type === newType)
    navigate({
      to: '/$songId/$type/$difficulty',
      params: {
        songId,
        type: newType,
        difficulty: getHighestDifficulty(sheetsOfType),
      },
    })
  }

  const handleDifficultyChange = (newDifficulty: DifficultyEnum) => {
    navigate({
      to: '/$songId/$type/$difficulty',
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

      <SongHeader song={song} />

      <SongSheetTabs
        sheets={song.sheets}
        availableTypes={availableTypes}
        activeType={activeType}
        activeDifficulty={activeDifficulty}
        onTypeChange={handleTypeChange}
        onDifficultyChange={handleDifficultyChange}
      />

      {flattenedSheets.map((sheet) => {
        const isActive = sheet.type === activeType && sheet.difficulty === activeDifficulty
        return (
          <div key={sheet.id} style={isActive ? undefined : { display: 'none' }} aria-hidden={!isActive}>
            <SongSheetContent sheet={sheet} isActive={isActive} />
          </div>
        )
      })}
    </div>
  )
}