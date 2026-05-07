import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { Button, IconButton } from '@mui/material'
import { type FC, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { TYPE_ORDER, getHighestDifficulty } from '../models/constants'
import { useAppContextDXDataVersion } from '../models/context/useAppContext'
import { type FlattenedSheet, canonicalId } from '../songs'
import { SongHeader } from '../components/song/SongHeader'
import { SongSheetContent } from '../components/song/SongSheetContent'
import { SongSheetTabs } from '../components/song/SongSheetTabs'

const routeApi = getRouteApi('/songs/$songId')

export const SongPage: FC = () => {
  const { t } = useTranslation(['song'])
  const { songId } = routeApi.useParams()
  const search = routeApi.useSearch()
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

  const [activeType, setActiveType] = useState<TypeEnum>(() => {
    const qType = (search.type ?? null) as TypeEnum | null
    if (qType && availableTypes.includes(qType)) return qType
    return availableTypes[0] ?? TypeEnum.DX
  })
  const [activeDifficulty, setActiveDifficulty] = useState<DifficultyEnum>(() => {
    const qType = (search.type ?? null) as TypeEnum | null
    const qDiff = (search.difficulty ?? null) as DifficultyEnum | null
    const effectiveType = qType && availableTypes.includes(qType) ? qType : (availableTypes[0] ?? TypeEnum.DX)
    const sheetsOfType = flattenedSheets.filter((s) => s.type === effectiveType)
    const availableDiffs = new Set(sheetsOfType.map((s) => s.difficulty))
    if (qDiff && availableDiffs.has(qDiff)) return qDiff
    return getHighestDifficulty(sheetsOfType)
  })

  const handleTypeChange = (newType: TypeEnum) => {
    setActiveType(newType)
    const sheetsOfType = flattenedSheets.filter((s) => s.type === newType)
    setActiveDifficulty(getHighestDifficulty(sheetsOfType))
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
        onDifficultyChange={setActiveDifficulty}
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