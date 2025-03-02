import { MULTIVER_AVAILABLE_VERSIONS, VERSION_ID_MAP, VERSION_SLUG_MAP } from '@gekichumai/dxdata'
import {
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import clsx from 'clsx'
import { type FC, memo, type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Trans, useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import useSWR from 'swr'
import { match } from 'ts-pattern'
import IconMdiSearchWeb from '~icons/mdi/search-web'
import IconMdiSpotify from '~icons/mdi/spotify'
import IconMdiYouTube from '~icons/mdi/youtube'
import RiBilibiliFill from '~icons/ri/bilibili-fill'
import { useAuth } from '../../models/context/AuthContext'
import { useAppContextDXDataVersion } from '../../models/context/useAppContext'
import { supabase } from '../../models/supabase'
import type { FlattenedSheet } from '../../songs'
import { calculateRating } from '../../utils/rating'
import { calculateScoreTable } from '../../utils/scores'
import { DXRank } from '../global/DXRank'
import { SheetDialogContentHeader } from './SheetDialogContentHeader'
import { SheetTitle } from './SheetListItem'
import { SheetTags } from './tags/SheetTags'

const PRESET_ACHIEVEMENT_RATES = [100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50]

const DeltaArrow: FC<{ delta: number }> = ({ delta }) => {
  const direction = match(delta)
    .when(
      (d) => d > 0,
      () => 'up',
    )
    .when(
      (d) => d < 0,
      () => 'down',
    )
    .otherwise(() => 'neutral')

  return (
    <img
      src={`https://shama.dxrating.net/images/rating-arrow/${direction}.png`}
      alt={direction}
      className="w-6 h-6 touch-callout-none"
      draggable={false}
    />
  )
}

const SectionHeader: FC<PropsWithChildren<object>> = ({ children }) => (
  <div className="font-lg font-bold">
    <span className="pb-1 px-1 mb-1 border-b border-solid border-gray-200 tracking-tight">{children}</span>
  </div>
)

const SheetComments: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { session } = useAuth()
  const [content, setContent] = useState<string>('')
  const {
    data: comments,
    isLoading: isLoadingComments,
    mutate,
  } = useSWR(
    'supabase::comments?' +
      new URLSearchParams({
        songId: sheet.songId,
        sheetType: sheet.type,
        sheetDifficulty: sheet.difficulty,
      }).toString(),
    async () => {
      const { data, error } = await supabase.functions.invoke<
        {
          id: number
          parent_id: number | null
          content: string
          created_at: string
          display_name: string | null
        }[]
      >('fetch-comment', {
        body: JSON.stringify({
          songId: sheet.songId,
          sheetType: sheet.type,
          sheetDifficulty: sheet.difficulty,
        }),
      })

      if (error) {
        throw error
      }
      return data
    },
  )

  const [{ loading: submitting }, handleSubmit] = useAsyncFn(async () => {
    const payload = {
      songId: sheet.songId,
      sheetType: sheet.type,
      sheetDifficulty: sheet.difficulty,
      content,
    }
    const { error } = await supabase.functions.invoke<{
      id: string
      created_at: string
    }>('create-comment', {
      body: JSON.stringify(payload),
    })
    if (error) {
      toast.error('Failed to submit comment: ' + error)
    }
    mutate()
    setContent('')
  }, [sheet, content])

  return (
    <div className="flex flex-col gap-2">
      {session && (
        <div className="flex gap-2 mt-1">
          <TextField
            className="flex-grow"
            placeholder="Leave a comment..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            minRows={1}
            maxRows={3}
            multiline
            data-attr="comment-input"
          />
          <Button variant="contained" onClick={handleSubmit} disabled={!content || submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Submit'}
          </Button>
        </div>
      )}

      {isLoadingComments ? (
        Array.from({ length: 1 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1 bg-zinc-2 rounded-lg h-16 animate-pulse" />
        ))
      ) : (
        <div className="flex flex-col gap-2">
          {comments?.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-1 bg-zinc-1 rounded-lg px-4 py-2">
              <div className="text-zinc-500 flex items-center">
                <div className="text-sm font-bold">{comment.display_name ?? '*Somebody*'}</div>

                <div className="text-xs ml-auto">{new Date(comment.created_at).toLocaleString()}</div>
              </div>
              <div>
                {comment.content.split('\n').map((line, i) => (
                  <p key={i}>{line ?? ' '}</p>
                ))}
              </div>
            </div>
          ))}
          {comments?.length === 0 && (
            <div className="flex flex-col gap-1 bg-zinc-2 rounded-lg p-4 items-center text-zinc-5">
              There are no comments yet.
              {!session && ' Sign in or create an account to leave one.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ScoreTable: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const scoreTable = useMemo(() => {
    return calculateScoreTable(sheet.noteCounts)
  }, [sheet.noteCounts])

  if (!scoreTable) return <div className="text-zinc-500 px-1">Score table is not available for this chart.</div>

  const noteTypes = [
    { key: 'tap' as const, label: 'TAP', count: sheet.noteCounts.tap },
    { key: 'hold' as const, label: 'HOLD', count: sheet.noteCounts.hold },
    { key: 'slide' as const, label: 'SLIDE', count: sheet.noteCounts.slide },
    { key: 'touch' as const, label: 'TOUCH', count: sheet.noteCounts.touch },
    { key: 'break' as const, label: 'BREAK', count: sheet.noteCounts.break },
  ].filter(({ count }) => count !== null && count > 0)

  const judgements = [
    { key: 'criticalPerfect' as const, label: 'Critical Perfect' },
    { key: 'perfect' as const, label: 'Perfect' },
    { key: 'perfect2nd' as const, label: 'Perfect -2' },
    { key: 'great' as const, label: 'Great' },
    { key: 'great2nd' as const, label: 'Great -2' },
    { key: 'great3rd' as const, label: 'Great -3' },
    { key: 'good' as const, label: 'Good' },
    { key: 'miss' as const, label: 'Miss' },
  ]

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Note Type</TableCell>
          {judgements.map(({ label }) => (
            <TableCell key={label} align="right">
              {label}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {noteTypes.map(({ key, label, count }) => (
          <TableRow key={key}>
            <TableCell component="th" scope="row">
              <div className="flex items-center gap-2">
                <span>{label}</span>
                <span className="text-zinc-500">({count})</span>
              </div>
            </TableCell>
            {judgements.map(({ key: judgementKey }) => (
              <TableCell key={judgementKey} align="right" className="tabular-nums">
                {scoreTable[key][judgementKey].toFixed(4)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export interface SheetDialogContentProps {
  sheet: FlattenedSheet
  currentAchievementRate?: number
}

export const SheetDialogContent: FC<SheetDialogContentProps> = memo(({ sheet, currentAchievementRate }) => {
  const { t, i18n } = useTranslation(['sheet'])
  const ratings = useMemo(() => {
    const rates = [...PRESET_ACHIEVEMENT_RATES]
    if (currentAchievementRate && !rates.includes(currentAchievementRate)) {
      rates.push(currentAchievementRate)
    }
    rates.sort((a, b) => b - a)
    return rates.map((rate) => ({
      achievementRate: rate,
      rating: calculateRating(sheet.internalLevelValue, rate),
    }))
  }, [sheet, currentAchievementRate])
  const releaseDate = new Date(sheet.releaseDateTimestamp)

  return (
    <div className="flex flex-col gap-2 relative">
      <SheetDialogContentHeader sheet={sheet} />

      <SheetTitle sheet={sheet} enableAltNames enableClickToCopy className="text-lg font-bold" />

      <div className="text-sm -mt-2">
        <div className="text-zinc-600">
          {sheet.releaseDate &&
            t('sheet:release-date', {
              absoluteDate: releaseDate.toLocaleString(i18n.language, {
                dateStyle: 'medium',
              }),
              relativeDate: new Intl.RelativeTimeFormat(i18n.language, {
                numeric: 'auto',
              }).format(Math.floor((releaseDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)), 'day'),
            })}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <SheetTags sheet={sheet} />
      </div>

      <div className="flex items-center">
        <IconMdiSearchWeb className="mr-2" />

        <Button
          startIcon={<IconMdiYouTube />}
          variant="outlined"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
            `maimai ${sheet.title} ${sheet.difficulty}`,
          )}`}
          target="_blank"
          className="inline-flex !text-[#ff0000] !b-[#ff0000] !hover:bg-[#ff000009] font-bold mr-2"
        >
          YouTube
        </Button>

        <div className="inline-flex !text-[#00A1D6] !b-[#00A1D6] b-solid b-1 mr-1 rounded-xl items-center">
          <RiBilibiliFill className="ml-2.5" />
          <ButtonGroup>
            <Button
              href={`bilibili://search?keyword=${encodeURIComponent(`${sheet.title} ${sheet.difficulty}`)}`}
              target="_blank"
              className="!rounded-none !text-[#00A1D6] !hover:bg-[#00A1D609] font-bold !b-none"
            >
              App
            </Button>
            <Button
              href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(
                `${sheet.title} ${sheet.difficulty}`,
              )}`}
              target="_blank"
              className="!rounded-none !text-[#00A1D6] !hover:bg-[#00A1D609] font-bold !b-none"
            >
              Web
            </Button>
          </ButtonGroup>
        </div>

        <IconButton
          href={`https://open.spotify.com/search/${encodeURIComponent(`${sheet.title} ${sheet.artist}`)}`}
          target="_blank"
          className="inline-flex !text-[#1db954] !b-[#1db954] !hover:bg-[#1db95409] font-bold"
        >
          <IconMdiSpotify className="h-6 w-6" />
        </IconButton>
      </div>

      <div className="flex flex-col gap-6 mt-2">
        {!sheet.isTypeUtage && (
          <div className="flex flex-col gap-1">
            <SectionHeader>{t('sheet:internal-level-history.title')}</SectionHeader>
            <SheetInternalLevelHistory sheet={sheet} />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <SectionHeader>{t('sheet:details.title')}</SectionHeader>
          <div>
            <Table size="small" className="mb-4">
              <TableHead>
                <TableRow>
                  <TableCell width="100px">{t('sheet:details.category')}</TableCell>
                  <TableCell width="200px">{sheet.category}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{t('sheet:details.song-artist')}</TableCell>
                  <TableCell>{sheet.artist}</TableCell>
                </TableRow>

                {!sheet.isTypeUtage && (
                  <>
                    <TableRow>
                      <TableCell>{t('sheet:details.bpm')}</TableCell>
                      <TableCell>{sheet.bpm}</TableCell>
                    </TableRow>

                    <TableRow className="bg-gray-1">
                      <TableCell>{t('sheet:details.chart-designer')}</TableCell>
                      <TableCell>{sheet.noteDesigner}</TableCell>
                    </TableRow>

                    {(sheet.noteCounts.tap ?? 0) > 0 && (
                      <>
                        <TableRow className="bg-gray-1">
                          <TableCell colSpan={2}>{t('sheet:details.notes-statistics.title')}</TableCell>
                        </TableRow>

                        <TableRow className="bg-gray-1">
                          <TableCell>— {t('sheet:details.notes-statistics.tap')}</TableCell>
                          <TableCell>{sheet.noteCounts.tap ?? 0}</TableCell>
                        </TableRow>

                        <TableRow className="bg-gray-1">
                          <TableCell>— {t('sheet:details.notes-statistics.hold')}</TableCell>
                          <TableCell>{sheet.noteCounts.hold ?? 0}</TableCell>
                        </TableRow>

                        <TableRow className="bg-gray-1">
                          <TableCell>— {t('sheet:details.notes-statistics.slide')}</TableCell>
                          <TableCell>{sheet.noteCounts.slide ?? 0}</TableCell>
                        </TableRow>

                        <TableRow className="bg-gray-1">
                          <TableCell>— {t('sheet:details.notes-statistics.touch')}</TableCell>
                          <TableCell>{sheet.noteCounts.touch ?? 0}</TableCell>
                        </TableRow>

                        <TableRow className="bg-gray-1">
                          <TableCell>— {t('sheet:details.notes-statistics.break')}</TableCell>
                          <TableCell>{sheet.noteCounts.break ?? 0}</TableCell>
                        </TableRow>

                        <TableRow className="bg-gray-1">
                          <TableCell>— {t('sheet:details.notes-statistics.total')}</TableCell>
                          <TableCell>{sheet.noteCounts.total?.toLocaleString('en-US')}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </>
                )}

                <TableRow>
                  <TableCell>{t('sheet:details.regional-availability')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {Object.entries(sheet.regions).map(([region, available]) => (
                        <div
                          key={region}
                          className={clsx(
                            'uppercase font-mono text-white font-bold select-none px-2 py-1 rounded-full text-xs',
                            available ? '!bg-green-500' : '!bg-gray-300',
                          )}
                        >
                          {region}
                        </div>
                      ))}{' '}
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell>{t('sheet:details.unlock-required')}</TableCell>
                  <TableCell>
                    <div
                      className={clsx(
                        'uppercase font-mono text-white font-bold select-none px-2 py-1 rounded-full text-xs inline-flex',
                        sheet.isLocked ? '!bg-yellow-500' : '!bg-gray-500',
                      )}
                    >
                      {sheet.isLocked ? 'LOCKED' : 'AVAILABLE'}
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="mt-4 text-xs text-zinc-500 text-right">
              <Trans
                i18nKey="sheet:details.credits"
                components={{
                  link: (
                    <a
                      href={`https://arcade-songs.zetaraku.dev/maimai/song/?id=${encodeURIComponent(sheet.songId)}`}
                      rel="noreferrer"
                      target="_blank"
                      className="tracking-tighter"
                    >
                      arcade-songs.zetaraku.dev
                    </a>
                  ),
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <SectionHeader>Comments</SectionHeader>
          <SheetComments sheet={sheet} />
        </div>

        {!sheet.isTypeUtage && (
          <div className="flex flex-col gap-1">
            <SectionHeader>{t('sheet:details.achievement-to-rating.title')}</SectionHeader>
            <div>
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
                    const isCurrentAchievementRateRow = rating.achievementRate === currentAchievementRate

                    return (
                      <TableRow
                        key={rating.achievementRate}
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                        }}
                        className={clsx(isCurrentAchievementRateRow && 'bg-amber')}
                      >
                        <TableCell component="th" scope="row">
                          <div className={clsx('flex items-center font-sans')}>
                            <DXRank rank={rating.rating.rank} className="h-8" />
                            <SheetAchievementRate value={rating.achievementRate} />
                            {isCurrentAchievementRateRow && (
                              <Chip label="Current" size="small" className="ml-2" color="default" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="relative font-sans">
                            <span className="font-bold">{rating.rating.ratingAwardValue}</span>

                            {nextRating && (
                              <div className="absolute -bottom-5 -left-1 px-1 text-xs text-zinc-500 bg-zinc-100 shadow-[0_0_0_1px_var(--un-shadow-color)] shadow-zinc-300/80 rounded-xs">
                                ↑{' '}
                                <span className="font-bold">
                                  {rating.rating.ratingAwardValue - nextRating.rating.ratingAwardValue}
                                </span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        {import.meta.env.DEV && (
          <div className="flex flex-col gap-1">
            <SectionHeader>{t('sheet:details.debug.title')}</SectionHeader>
            <div>
              <pre className="text-xs">{JSON.stringify(sheet, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
SheetDialogContent.displayName = 'memo(SheetDialogContent)'

const SheetAchievementRate: FC<{ value: number }> = ({ value }) => {
  const integer = Math.floor(value)
  const decimal = value % 1

  return (
    <div className="inline-flex items-center">
      <span className="font-bold">{integer}</span>
      <span>.</span>
      <span className={clsx(decimal === 0 && 'text-zinc-4')}>{decimal.toFixed(4).slice(2)}</span>
      <span>%</span>
    </div>
  )
}

const SheetInternalLevelHistory: FC<{
  sheet: FlattenedSheet
}> = ({ sheet }) => {
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
          // add `delta` field
          let delta: number | undefined
          const accReversed = [...acc].reverse()
          const prev = accReversed.find((v) => v.internalLevelValue !== undefined)
          if (prev && internalLevelValue !== undefined && prev.internalLevelValue !== undefined) {
            delta = internalLevelValue - prev.internalLevelValue
          }

          acc.push({ version, internalLevelValue, delta, ...extra })
          return acc
        },
        [] as {
          version: string
          internalLevelValue?: number
          delta?: number
          available: boolean
        }[],
      ),
    [sheet],
  )

  useEffect(() => {
    if (scrollableContainer.current) {
      // hide the scrollbar when scrolling to the right
      scrollableContainer.current.style.overflowX = 'hidden'
      scrollableContainer.current.scrollLeft = scrollableContainer.current.scrollWidth
      // restore the scrollbar
      scrollableContainer.current.style.overflowX = 'auto'
    }
  }, [multiverInternalLevelValues])

  return (
    <div className="overflow-x-auto" ref={scrollableContainer}>
      {multiverInternalLevelValues.filter((v) => v.internalLevelValue !== undefined).length > 0 ? (
        <Table size="small" className="mb-4">
          <TableHead>
            <TableRow>
              {multiverInternalLevelValues.map(({ version, available }) => (
                <TableCell
                  key={version}
                  className={clsx(appVersion === version && 'bg-amber-200', !available && 'opacity-50')}
                >
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
                <TableCell
                  key={version}
                  className={clsx(appVersion === version && 'bg-amber-200', !available && 'opacity-50')}
                >
                  {internalLevelValue === undefined ? (
                    <div className="text-zinc-500 select-none">{available ? '—' : '／'}</div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-bold tabular-nums">{internalLevelValue?.toFixed(1)}</span>
                      {delta !== undefined && <DeltaArrow delta={delta} />}
                    </div>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <div className="text-zinc-500 px-1">{t('sheet:internal-level-history.empty')}</div>
      )}
    </div>
  )
}
