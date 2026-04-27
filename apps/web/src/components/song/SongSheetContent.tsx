import { MULTIVER_AVAILABLE_VERSIONS, VERSION_ID_MAP, VERSION_SLUG_MAP } from '@gekichumai/dxdata'
import {
  Button,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import clsx from 'clsx'
import { type FC, type PropsWithChildren, memo, useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import useSWR from 'swr'
import { match } from 'ts-pattern'
import { apiClient as client } from '../../lib/orpc'
import { useAuth } from '../../hooks/useAuth'
import { useAppContextDXDataVersion } from '../../models/context/useAppContext'
import type { FlattenedSheet } from '../../songs'
import { calculateRating } from '../../utils/rating'
import { DXRank } from '../global/DXRank'
import { SheetTags } from '../sheet/tags/SheetTags'
import { SheetDifficulty } from '../sheet/SheetListItem'

const PRESET_ACHIEVEMENT_RATES = [100.5, 100, 99.5, 99, 98, 97, 94, 90, 80, 75, 70, 60, 50]

const SectionHeader: FC<PropsWithChildren<object>> = ({ children }) => (
  <div className="font-lg font-bold">
    <span className="pb-1 px-1 mb-1 border-b border-solid border-gray-200 tracking-tight">{children}</span>
  </div>
)

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

const InternalLevelHistory: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
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
      scrollableContainer.current.style.overflowX = 'hidden'
      scrollableContainer.current.scrollLeft = scrollableContainer.current.scrollWidth
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

const Comments: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['auth', 'sheet', 'global'])
  const { session, ensureAuthenticated, openLoginDialog, LoginDialog } = useAuth()
  const [content, setContent] = useState<string>('')
  const {
    data: comments,
    isLoading: isLoadingComments,
    mutate,
  } = useSWR(['comments.list', sheet.songId, sheet.type, sheet.difficulty], async () => {
    const data = await client.comments.list({
      songId: sheet.songId,
      sheetType: sheet.type,
      sheetDifficulty: sheet.difficulty,
    })
    return data.map((c) => ({
      ...c,
      created_at: c.created_at.toString(),
    }))
  })

  const [{ loading: submitting }, handleSubmit] = useAsyncFn(async () => {
    const isAuthenticated = await ensureAuthenticated()
    if (!isAuthenticated) return

    const payload = {
      songId: sheet.songId,
      sheetType: sheet.type,
      sheetDifficulty: sheet.difficulty,
      content,
    }
    await client.comments.create(payload)

    mutate()
    setContent('')
  }, [sheet, content, ensureAuthenticated])

  return (
    <div className="flex flex-col gap-2">
      <LoginDialog />

      <div className="flex gap-2 mt-1 relative">
        <TextField
          className="flex-grow"
          placeholder={t('sheet:comments.placeholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          minRows={1}
          maxRows={3}
          multiline
          data-attr="comment-input"
          disabled={!session}
        />
        <Button variant="contained" onClick={handleSubmit} disabled={!content || submitting}>
          {submitting ? <CircularProgress size={24} /> : t('global:submit')}
        </Button>

        {!session && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-white/80 rounded cursor-pointer z-1"
            onClick={openLoginDialog}
            onKeyDown={(e) => e.key === 'Enter' && openLoginDialog()}
            role="button"
            tabIndex={0}
          >
            <span className="font-bold text-sm text-zinc-600 underline underline-offset-2">
              {t('auth:form.login-or-register-to-comment')}
            </span>
          </div>
        )}
      </div>

      {isLoadingComments ? (
        Array.from({ length: 1 }).map((_, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- index is stable
          <div key={i} className="flex flex-col gap-1 bg-zinc-2 rounded-lg h-16 animate-pulse" />
        ))
      ) : (
        <div className="flex flex-col gap-2">
          {comments?.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-1 bg-zinc-1 rounded-lg px-4 py-2">
              <div className="text-zinc-500 flex items-center">
                <div className="text-sm font-bold">{comment.display_name ?? t('sheet:comments.anonymous')}</div>
                <div className="text-xs ml-auto">{new Date(comment.created_at).toLocaleString()}</div>
              </div>
              <div>
                {comment.content.split('\n').map((line) => (
                  <p key={line}>{line ?? ' '}</p>
                ))}
              </div>
            </div>
          ))}
          {comments?.length === 0 && (
            <div className="flex flex-col gap-1 bg-zinc-2 rounded-lg p-4 items-center text-zinc-5">
              {t('sheet:comments.empty')}
              {!session && ` ${t('sheet:comments.sign-in-to-comment')}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const SongSheetContent: FC<{ sheet: FlattenedSheet; isActive?: boolean }> = memo(
  ({ sheet, isActive = true }) => {
    const { t, i18n } = useTranslation(['sheet', 'global'])
    const ratings = useMemo(
      () =>
        [...PRESET_ACHIEVEMENT_RATES]
          .sort((a, b) => b - a)
          .map((rate) => ({
            achievementRate: rate,
            rating: calculateRating(sheet.internalLevelValue, rate),
          })),
      [sheet.internalLevelValue],
    )
    const releaseDate = new Date(sheet.releaseDateTimestamp)

    return (
      <div className="flex flex-col gap-2 relative">
        <div className="flex items-center gap-2 flex-wrap">
          <SheetDifficulty difficulty={sheet.difficulty} regions={sheet.regions} isLocked={sheet.isLocked} />
          {!sheet.isTypeUtage && (
            <span className="font-bold tabular-nums text-2xl">{sheet.internalLevelValue.toFixed(1)}</span>
          )}
          {sheet.isTypeUtage && (
            <span className="font-bold tracking-tighter tabular-nums text-xl text-zinc-600">{sheet.level}</span>
          )}
        </div>

        <div className="text-sm">
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

        <div className="flex flex-col gap-6 mt-2">
          {!sheet.isTypeUtage && (
            <div className="flex flex-col gap-1">
              <SectionHeader>{t('sheet:internal-level-history.title')}</SectionHeader>
              <InternalLevelHistory sheet={sheet} />
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
                        {sheet.isLocked ? t('global:locked') : t('global:available')}
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

          {isActive && (
            <div className="flex flex-col gap-1">
              <SectionHeader>{t('sheet:comments.title')}</SectionHeader>
              <Comments sheet={sheet} />
            </div>
          )}

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

                      return (
                        <TableRow
                          key={rating.achievementRate}
                          sx={{
                            '&:last-child td, &:last-child th': { border: 0 },
                          }}
                        >
                          <TableCell component="th" scope="row">
                            <div className={clsx('flex items-center font-sans')}>
                              <DXRank rank={rating.rating.rank} className="h-8" />
                              <SheetAchievementRate value={rating.achievementRate} />
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
  },
)
SongSheetContent.displayName = 'SongSheetContent'