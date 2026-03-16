import { MULTIVER_AVAILABLE_VERSIONS, VERSION_ID_MAP, VERSION_SLUG_MAP, TypeEnum, type Song, type Sheet } from '@gekichumai/dxdata'
import {
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import clsx from 'clsx'
import { type FC, useMemo, useRef, useEffect, memo } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiSearchWeb from '~icons/mdi/search-web'
import IconMdiSpotify from '~icons/mdi/spotify'
import IconMdiYouTube from '~icons/mdi/youtube'
import RiBilibiliFill from '~icons/ri/bilibili-fill'
import { useAppContextDXDataVersion } from '../../models/context/useAppContext'
import { canonicalId, type FlattenedSheet, getFlattenedSheets } from '../../songs'
import { calculateRating } from '../../utils/rating'
import { DXRank } from '../global/DXRank'
import { FadedImage } from '../global/FadedImage'
import { SheetDifficulty, SheetImage } from './SheetListItem'
import { SheetTags } from './tags/SheetTags'
import { DIFFICULTIES } from '../../models/difficulties'

const PRESET_ACHIEVEMENT_RATES = [100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50]

const SectionHeader: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-lg font-bold">
    <span className="pb-1 px-1 mb-1 border-b border-solid border-gray-200 tracking-tight">{children}</span>
  </div>
)

const AchievementToRatingTable: FC<{ sheet: FlattenedSheet }> = memo(({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const ratings = useMemo(() => {
    return PRESET_ACHIEVEMENT_RATES.map((rate) => ({
      achievementRate: rate,
      rating: calculateRating(sheet.internalLevelValue, rate),
    }))
  }, [sheet.internalLevelValue])

  return (
    <Table className="tabular-nums" size="small">
      <TableHead>
        <TableRow>
          <TableCell width="100px">{t('sheet:details.achievement-to-rating.achievement')}</TableCell>
          <TableCell width="50px">{t('sheet:details.achievement-to-rating.rating')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ratings.map((rating, i) => {
          const nextRating = i === ratings.length - 1 ? null : ratings[i + 1]
          return (
            <TableRow key={rating.achievementRate}>
              <TableCell component="th" scope="row">
                <div className="flex items-center font-sans">
                  <DXRank rank={rating.rating.rank} className="h-8" />
                  <span className="font-bold">{Math.floor(rating.achievementRate)}</span>
                  <span>.</span>
                  <span className={clsx((rating.achievementRate % 1) === 0 && 'text-zinc-4')}>
                    {(rating.achievementRate % 1).toFixed(4).slice(2)}
                  </span>
                  <span>%</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="relative font-sans">
                  <span className="font-bold">{rating.rating.ratingAwardValue}</span>
                  {nextRating && (
                    <div className="absolute -bottom-5 -left-1 px-1 text-xs text-zinc-500 bg-zinc-100 shadow-[0_0_0_1px_var(--un-shadow-color)] shadow-zinc-300/80 rounded-xs">
                      ↑ <span className="font-bold">{rating.rating.ratingAwardValue - nextRating.rating.ratingAwardValue}</span>
                    </div>
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
})
AchievementToRatingTable.displayName = 'AchievementToRatingTable'

const SheetInternalLevelHistory: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const appVersion = useAppContextDXDataVersion()
  const scrollableContainer = useRef<HTMLDivElement>(null)
  const multiverInternalLevelValues = useMemo(
    () =>
      MULTIVER_AVAILABLE_VERSIONS.map((version) => ({
        version,
        internalLevelValue: sheet.multiverInternalLevelValue?.[version],
        available: VERSION_ID_MAP.get(version)! >= VERSION_ID_MAP.get(sheet.version)!,
      })).reduce(
        (acc, { version, internalLevelValue, ...extra }) => {
          let delta: number | undefined
          const accReversed = [...acc].reverse()
          const prev = accReversed.find((v) => v.internalLevelValue !== undefined)
          if (prev && internalLevelValue !== undefined && prev.internalLevelValue !== undefined) {
            delta = internalLevelValue - prev.internalLevelValue
          }
          acc.push({ version, internalLevelValue, delta, ...extra })
          return acc
        },
        [] as { version: string; internalLevelValue?: number; delta?: number; available: boolean }[],
      ),
    [sheet],
  )

  useEffect(() => {
    if (scrollableContainer.current) {
      scrollableContainer.current.style.overflowX = 'hidden'
      scrollableContainer.current.scrollLeft = scrollableContainer.current.scrollWidth
      scrollableContainer.current.style.overflowX = 'auto'
    }
  }, [multiverInternalLevelValues])

  const hasData = multiverInternalLevelValues.filter((v) => v.internalLevelValue !== undefined).length > 0

  if (!hasData) {
    return <div className="text-zinc-500 px-1">{t('sheet:internal-level-history.empty')}</div>
  }

  return (
    <div className="overflow-x-auto" ref={scrollableContainer}>
      <Table size="small" className="mb-4">
        <TableHead>
          <TableRow>
            {multiverInternalLevelValues.map(({ version, available }) => (
              <TableCell key={version} className={clsx(appVersion === version && 'bg-amber-200', !available && 'opacity-50')}>
                <img
                  src={`https://shama.dxrating.net/images/version-title/${VERSION_SLUG_MAP.get(version)}.png`}
                  alt={VERSION_SLUG_MAP.get(version)}
                  className="h-40.75px w-83px min-w-[83px] -ml-1 touch-callout-none"
                  draggable={false}
                />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            {multiverInternalLevelValues.map(({ version, internalLevelValue, available, delta }) => (
              <TableCell key={version} className={clsx(appVersion === version && 'bg-amber-200', !available && 'opacity-50')}>
                {internalLevelValue === undefined ? (
                  <div className="text-zinc-500 select-none">{available ? '—' : '／'}</div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="font-bold tabular-nums">{internalLevelValue?.toFixed(1)}</span>
                  </div>
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

const ChartSection: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const difficultyConfig = sheet.difficulty ? DIFFICULTIES[sheet.difficulty] : undefined

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{
        backgroundColor: difficultyConfig ? `${difficultyConfig.color}10` : undefined,
        border: difficultyConfig ? `1px solid ${difficultyConfig.color}30` : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <SheetDifficulty difficulty={sheet.difficulty} regions={sheet.regions} isLocked={sheet.isLocked} />
        <span className="text-sm text-zinc-500">
          {sheet.type === TypeEnum.DX ? 'DX' : sheet.type === TypeEnum.STD ? 'STD' : sheet.type}
        </span>
        {!sheet.isTypeUtage && (
          <span className="font-bold tabular-nums text-lg">
            {sheet.internalLevelValue.toFixed(1)}
          </span>
        )}
        {sheet.noteDesigner && <span className="text-xs text-zinc-500 ml-auto">Chart: {sheet.noteDesigner}</span>}
      </div>

      {!sheet.isTypeUtage && (
        <SheetInternalLevelHistory sheet={sheet} />
      )}

      {(sheet.noteCounts.tap ?? 0) > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
          <span>TAP: {sheet.noteCounts.tap}</span>
          <span>HOLD: {sheet.noteCounts.hold}</span>
          <span>SLIDE: {sheet.noteCounts.slide}</span>
          <span>TOUCH: {sheet.noteCounts.touch}</span>
          <span>BREAK: {sheet.noteCounts.break}</span>
          <span className="font-bold">TOTAL: {sheet.noteCounts.total?.toLocaleString('en-US')}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <SheetTags sheet={sheet} />
      </div>

      {!sheet.isTypeUtage && (
        <div className="flex flex-col gap-1">
          <SectionHeader>{t('sheet:details.achievement-to-rating.title')}</SectionHeader>
          <AchievementToRatingTable sheet={sheet} />
        </div>
      )}
    </div>
  )
}

export const SongDetailPage: FC<{ song: Song }> = ({ song }) => {
  const { t, i18n } = useTranslation(['sheet', 'global'])
  const appVersion = useAppContextDXDataVersion()

  const sheets = useMemo(() => {
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
        tags: [],
      } as FlattenedSheet
    })
  }, [song, appVersion])

  // Group sheets by type
  const dxSheets = sheets.filter((s) => s.type === TypeEnum.DX)
  const stdSheets = sheets.filter((s) => s.type === TypeEnum.STD)
  const utageSheets = sheets.filter((s) => s.isTypeUtage)

  return (
    <div className="flex-container pb-global">
      {/* Song header */}
      <div className="flex gap-4 items-start w-full">
        <FadedImage
          src={`https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`}
          className="h-24 w-24 min-w-[6rem] min-h-[6rem] rounded-xl overflow-hidden"
          placeholderClassName="bg-slate-300/50"
          alt={song.title}
        />
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-xl font-bold leading-tight break-words">{song.title}</h1>
          <div className="text-sm text-zinc-600">{song.artist}</div>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
            <span>{song.category}</span>
            {song.bpm && <span>BPM {song.bpm}</span>}
            <span>ver. {song.version}</span>
          </div>
        </div>
      </div>

      {/* Search links */}
      <div className="flex items-center gap-2">
        <IconMdiSearchWeb className="text-zinc-500" />
        <Button
          startIcon={<IconMdiYouTube />}
          variant="outlined"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`maimai ${song.title}`)}`}
          target="_blank"
          className="!text-[#ff0000] !b-[#ff0000] !hover:bg-[#ff000009]"
          size="small"
        >
          YouTube
        </Button>
        <Button
          startIcon={<RiBilibiliFill />}
          variant="outlined"
          href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(song.title)}`}
          target="_blank"
          className="!text-[#00A1D6] !b-[#00A1D6] !hover:bg-[#00A1D609]"
          size="small"
        >
          Bilibili
        </Button>
        <IconButton
          href={`https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`}
          target="_blank"
          size="small"
          className="!text-[#1db954]"
        >
          <IconMdiSpotify />
        </IconButton>
      </div>

      {/* Regional availability */}
      <div className="flex items-center gap-2">
        {Object.entries(sheets[0]?.regions ?? {}).map(([region, available]) => (
          <div
            key={region}
            className={clsx(
              'uppercase font-mono text-white font-bold select-none px-2 py-1 rounded-full text-xs',
              available ? '!bg-green-500' : '!bg-gray-300',
            )}
          >
            {region}
          </div>
        ))}
        {sheets[0]?.isLocked && (
          <Chip
            label={t('global:locked')}
            size="small"
            className="!bg-yellow-500 !text-white"
          />
        )}
      </div>

      {/* Charts by type */}
      {dxSheets.length > 0 && (
        <div className="flex flex-col gap-3 w-full">
          <h2 className="text-lg font-bold">DX Charts</h2>
          {dxSheets.map((sheet) => (
            <ChartSection key={sheet.id} sheet={sheet} />
          ))}
        </div>
      )}

      {stdSheets.length > 0 && (
        <div className="flex flex-col gap-3 w-full">
          <h2 className="text-lg font-bold">Standard Charts</h2>
          {stdSheets.map((sheet) => (
            <ChartSection key={sheet.id} sheet={sheet} />
          ))}
        </div>
      )}

      {utageSheets.length > 0 && (
        <div className="flex flex-col gap-3 w-full">
          <h2 className="text-lg font-bold">Utage Charts</h2>
          {utageSheets.map((sheet) => (
            <ChartSection key={sheet.id} sheet={sheet} />
          ))}
        </div>
      )}
    </div>
  )
}
