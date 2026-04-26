import { DifficultyEnum, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { Button } from '@mui/material'
import { type FC, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRoute } from 'wouter'
import { useSongHead } from '../hooks/useUnhead'
import { useAppContextDXDataVersion } from '../models/context/useAppContext'
import { type FlattenedSheet, canonicalId } from '../songs'
import { SongHeader } from '../components/song/SongHeader'
import { SongSheetContent } from '../components/song/SongSheetContent'
import { SongSheetTabs } from '../components/song/SongSheetTabs'

const TYPE_ORDER = [TypeEnum.DX, TypeEnum.STD, TypeEnum.UTAGE, TypeEnum.UTAGE2P] as const
const DIFFICULTY_ORDER = [
  DifficultyEnum.ReMaster,
  DifficultyEnum.Master,
  DifficultyEnum.Expert,
  DifficultyEnum.Advanced,
  DifficultyEnum.Basic,
] as const

function getHighestDifficulty(sheets: { difficulty: DifficultyEnum }[]): DifficultyEnum {
  const diffSet = new Set(sheets.map((s) => s.difficulty))
  return DIFFICULTY_ORDER.find((d) => diffSet.has(d)) ?? DifficultyEnum.Master
}

export const SongPage: FC = () => {
  const { t } = useTranslation(['song'])
  const [, params] = useRoute('/song/:songId')
  const songId = params?.songId
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

  const [activeType, setActiveType] = useState<string>(() => availableTypes[0] ?? TypeEnum.DX)
  const [activeDifficulty, setActiveDifficulty] = useState<string>(() => {
    const sheetsOfType = flattenedSheets.filter((s) => s.type === (availableTypes[0] ?? TypeEnum.DX))
    return getHighestDifficulty(sheetsOfType)
  })

  const handleTypeChange = (newType: string) => {
    setActiveType(newType)
    const sheetsOfType = flattenedSheets.filter((s) => s.type === newType)
    setActiveDifficulty(getHighestDifficulty(sheetsOfType))
  }

  // Head meta tags (song-level, don't change with tabs)
  useSongHead({
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    category: song?.category ?? '',
    songId: songId ?? '',
    imageName: song?.imageName ?? '',
  })

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
      <SongHeader song={song} />

      <SongSheetTabs
        sheets={song.sheets}
        activeType={activeType}
        activeDifficulty={activeDifficulty}
        onTypeChange={handleTypeChange}
        onDifficultyChange={setActiveDifficulty}
      />

      {/* All sheet panels render for SEO; only active one is visible */}
      {flattenedSheets.map((sheet) => {
        const isActive = sheet.type === activeType && sheet.difficulty === activeDifficulty
        return (
          <div key={sheet.id} style={isActive ? undefined : { display: 'none' }} aria-hidden={!isActive}>
            <SongSheetContent sheet={sheet} />
          </div>
        )
      })}
    </div>
  )
}