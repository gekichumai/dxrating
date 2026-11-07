import { SERVER_BADGE_ORDER } from '@/models/constants'
import { CommentActions } from '../comments/CommentActions'
import { filterComments, useCommentVisibility } from '../comments/commentVisibility'
import { MULTIVER_AVAILABLE_VERSIONS, VERSION_ID_MAP, VERSION_SLUG_MAP } from '@gekichumai/dxdata'
import {
  Button,
  ButtonGroup,
  CircularProgress,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import clsx from 'clsx'
import { MotionConfig } from 'motion/react'
import { type FC, type PropsWithChildren, type ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react'
import { useAsyncFn } from 'react-use'
import useSWR from 'swr'
import { match } from 'ts-pattern'
import IconMdiCheck from '~icons/mdi/check'
import IconMdiLock from '~icons/mdi/lock'
import IconMdiSearchWeb from '~icons/mdi/search-web'
import IconMdiSpotify from '~icons/mdi/spotify'
import IconMdiYouTube from '~icons/mdi/youtube'
import RiBilibiliFill from '~icons/ri/bilibili-fill'
import { apiClient as client } from '../../lib/orpc'
import { useAuth } from '../../hooks/useAuth'
import { useAppContextDXDataVersion } from '../../models/context/useAppContext'
import type { FlattenedSheet } from '../../songs'
import { formatSheetReleaseDateParts } from '../../utils/dateFormatting'
import { useRenderedAt } from '../../utils/renderEnvironment'
import { AchievementRatingTable } from './AchievementRatingTable'
import { SheetDialogContentHeader } from './SheetDialogContentHeader'
import { SheetTitle } from './SheetListItem'
import { SheetTags } from './tags/SheetTags'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const DeltaArrow: FC<{ delta: number }> = ({ delta }) => {
  const locale = useLocale()
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
  const altText =
    delta > 0
      ? m.sheet_internalLevelHistory_delta_increased({}, { locale })
      : delta < 0
        ? m.sheet_internalLevelHistory_delta_decreased({}, { locale })
        : m.sheet_internalLevelHistory_delta_unchanged({}, { locale })

  return (
    <img
      src={`https://shama.dxrating.net/images/rating-arrow/${direction}.png`}
      alt={altText}
      className="w-6 h-6 touch-callout-none"
      draggable={false}
    />
  )
}

const SectionHeader: FC<PropsWithChildren<object>> = ({ children }) => (
  <h3 className="section-title m-0 px-1 pb-1 border-b border-solid border-black/8">{children}</h3>
)

/**
 * The dialog title: MUI's DialogTitle takes the id the Dialog is labelled by. Outside a Dialog (the mobile drawer, the
 * song page) it is a plain h2.
 */
const SheetDialogTitleHeading: FC<{ className?: string; children?: ReactNode }> = ({ className, children }) => (
  // The reset is on the h2 and the title's own size and layout on an inner span, so the reset can't override them
  <DialogTitle component="h2" className="min-w-0" sx={{ m: 0, p: 0, font: 'inherit', letterSpacing: 'inherit' }}>
    <span className={className}>{children}</span>
  </DialogTitle>
)

// Comments load on the client only, so formatting in the app locale cannot differ from a server render
const CommentCreatedAt: FC<{ createdAt: string }> = ({ createdAt }) => {
  const locale = useLocale()
  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(createdAt)),
    [createdAt, locale],
  )

  return (
    <time className="text-xs ml-auto num" dateTime={createdAt}>
      {formattedDate}
    </time>
  )
}

const ReleaseDateText: FC<{ releaseDate: string }> = ({ releaseDate }) => {
  const locale = useLocale()
  const renderedAt = useRenderedAt()
  const releaseDateText = useMemo(() => {
    const parts = formatSheetReleaseDateParts(releaseDate, locale, renderedAt)

    return m.sheet_releaseDate(parts, { locale })
  }, [releaseDate, locale, renderedAt])

  return releaseDateText
}

const SheetComments: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const locale = useLocale()
  const { session, user, ensureAuthenticated, openLoginDialog, LoginDialog } = useAuth()
  const visibility = useCommentVisibility(user?.id)
  const [content, setContent] = useState<string>('')
  const {
    data: comments,
    isLoading: isLoadingComments,
    mutate,
  } = useSWR(
    // Key
    ['comments.list', user?.id ?? null, sheet.songId, sheet.type, sheet.difficulty],
    // Fetcher
    async () => {
      const data = await client.comments.list({
        songId: sheet.songId,
        sheetId: sheet.id,
        sheetType: sheet.type,
        sheetDifficulty: sheet.difficulty,
      })
      // Map to UI expected format if needed
      // Backend returns: CommentWithProfileSchema (id, parent_id, created_at, content, display_name)
      // UI expects: { id, parent_id, content, created_at, display_name }
      // Dates: created_at: Date | string. UI: new Date(comment.created_at).
      return data.map((c) => ({
        ...c,
        created_at: c.created_at.toString(),
      }))
    },
  )

  const [{ loading: submitting }, handleSubmit] = useAsyncFn(async () => {
    const isAuthenticated = await ensureAuthenticated()
    if (!isAuthenticated) return

    const payload = {
      songId: sheet.songId,
      sheetId: sheet.id,
      sheetType: sheet.type,
      sheetDifficulty: sheet.difficulty,
      content,
    }
    await client.comments.create(payload) // Logic handles auth and parentId

    mutate()
    setContent('')
  }, [sheet, content, ensureAuthenticated])

  return (
    <div className="flex flex-col gap-2">
      <LoginDialog />

      {session ? (
        <div className="flex gap-2 mt-1">
          <TextField
            className="flex-grow"
            label={m.sheet_comments_inputLabel({}, { locale })}
            placeholder={m.sheet_comments_placeholder({}, { locale })}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            minRows={1}
            maxRows={3}
            multiline
            data-attr="comment-input"
          />
          <Button variant="contained" onClick={handleSubmit} disabled={!content || submitting}>
            {submitting ? (
              <CircularProgress size={24} aria-label={m.global_submit({}, { locale })} />
            ) : (
              m.global_submit({}, { locale })
            )}
          </Button>
        </div>
      ) : (
        <Button variant="outlined" className="self-start" onClick={openLoginDialog}>
          {m.auth_form_loginOrRegisterToComment({}, { locale })}
        </Button>
      )}

      {isLoadingComments ? (
        Array.from({ length: 1 }).map((_, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- index is stable
          <div key={i} className="glass-inset h-16 motion-safe:animate-pulse" />
        ))
      ) : (
        <div className="flex flex-col gap-2">
          {filterComments(comments ?? [], visibility).map((comment) => (
            <div key={comment.id} className="glass-inset flex flex-col gap-1 px-4 py-2">
              <div className="text-fg-2 flex items-center gap-1">
                <div className="text-sm font-semibold">
                  {comment.display_name ?? m.sheet_comments_anonymous({}, { locale })}
                </div>
                <CommentActions comment={comment} />

                <CommentCreatedAt createdAt={comment.created_at} />
              </div>
              <div>
                {comment.content.split('\n').map((line, i) => (
                  <p key={line}>{line ?? ' '}</p>
                ))}
              </div>
            </div>
          ))}
          {filterComments(comments ?? [], visibility).length === 0 && (
            <p className="glass-inset m-0 p-4 text-center text-sm text-fg-2">
              {m.sheet_comments_empty({}, { locale })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export interface SheetDialogContentProps {
  sheet: FlattenedSheet
  currentAchievementRate?: number
  /** Shows a close button in the header (the dialog otherwise closes only on Escape or the backdrop) */
  onClose?: () => void
}

const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

export const SheetDialogContent: FC<SheetDialogContentProps> = memo(({ sheet, currentAchievementRate, onClose }) => {
  const locale = useLocale()
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale])

  return (
    // Under reduced motion the cover, star and tag springs become instant; opacity fades remain
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-2 relative">
        <SheetDialogContentHeader sheet={sheet} onClose={onClose} />

        <SheetTitle
          sheet={sheet}
          enableAltNames
          enableClickToCopy
          headingComponent={SheetDialogTitleHeading}
          className="text-lg font-semibold"
        />

        <div className="text-sm -mt-2">
          <div className="text-fg-2">{sheet.releaseDate && <ReleaseDateText releaseDate={sheet.releaseDate} />}</div>
        </div>

        <div className="flex flex-wrap gap-1">
          <SheetTags sheet={sheet} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IconMdiSearchWeb aria-hidden="true" className="text-fg-2" />

          <Button
            startIcon={<IconMdiYouTube aria-hidden="true" className="text-[#ff0000]" />}
            variant="outlined"
            color="inherit"
            size="small"
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
              `maimai ${sheet.title} ${sheet.difficulty}`,
            )}`}
            {...externalLinkProps}
            aria-label={m.sheet_externalSearch_youtube({}, { locale })}
            className="!border-black/25"
          >
            YouTube
          </Button>

          <ButtonGroup variant="outlined" color="inherit" size="small" className="[&_.MuiButton-root]:!border-black/25">
            <Button
              startIcon={<RiBilibiliFill aria-hidden="true" className="text-[#00A1D6]" />}
              href={`bilibili://search?keyword=${encodeURIComponent(`${sheet.title} ${sheet.difficulty}`)}`}
              {...externalLinkProps}
              aria-label={m.sheet_externalSearch_bilibiliApp({}, { locale })}
            >
              {m.sheet_externalSearch_app({}, { locale })}
            </Button>
            <Button
              href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(
                `${sheet.title} ${sheet.difficulty}`,
              )}`}
              {...externalLinkProps}
              aria-label={m.sheet_externalSearch_bilibiliWeb({}, { locale })}
            >
              {m.sheet_externalSearch_web({}, { locale })}
            </Button>
          </ButtonGroup>

          <Button
            startIcon={<IconMdiSpotify aria-hidden="true" className="text-[#1db954]" />}
            variant="outlined"
            color="inherit"
            size="small"
            href={`https://open.spotify.com/search/${encodeURIComponent(`${sheet.title} ${sheet.artist}`)}`}
            {...externalLinkProps}
            aria-label={m.sheet_externalSearch_spotify({}, { locale })}
            className="!border-black/25"
          >
            Spotify
          </Button>
        </div>

        <div className="flex flex-col gap-6 mt-2">
          {!sheet.isTypeUtage && (
            <div className="flex flex-col gap-1">
              <SectionHeader>{m.sheet_internalLevelHistory_title({}, { locale })}</SectionHeader>
              <SheetInternalLevelHistory sheet={sheet} />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <SectionHeader>{m.sheet_details_title({}, { locale })}</SectionHeader>
            <div>
              <Table
                size="small"
                className="mb-4 [&_th]:w-[40%] sm:[&_th]:w-[11rem] [&_th]:!text-fg-2 [&_th]:font-normal [&_th]:[word-break:auto-phrase]"
              >
                <TableBody>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      {m.sheet_details_category({}, { locale })}
                    </TableCell>
                    <TableCell>{sheet.category}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell component="th" scope="row">
                      {m.sheet_details_songArtist({}, { locale })}
                    </TableCell>
                    <TableCell>{sheet.artist}</TableCell>
                  </TableRow>

                  {!sheet.isTypeUtage && (
                    <>
                      <TableRow>
                        <TableCell component="th" scope="row">
                          {m.sheet_details_bpm({}, { locale })}
                        </TableCell>
                        <TableCell>{sheet.bpm}</TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell component="th" scope="row">
                          {m.sheet_details_chartDesigner({}, { locale })}
                        </TableCell>
                        <TableCell>{sheet.noteDesigner}</TableCell>
                      </TableRow>

                      {(sheet.noteCounts.tap ?? 0) > 0 && (
                        <>
                          <TableRow>
                            <TableCell component="th" scope="rowgroup" colSpan={2}>
                              {m.sheet_details_notesStatistics_title({}, { locale })}
                            </TableCell>
                          </TableRow>

                          <TableRow>
                            <TableCell component="th" scope="row" className="!pl-8">
                              {m.sheet_details_notesStatistics_tap({}, { locale })}
                            </TableCell>
                            <TableCell className="num">{numberFormat.format(sheet.noteCounts.tap ?? 0)}</TableCell>
                          </TableRow>

                          <TableRow>
                            <TableCell component="th" scope="row" className="!pl-8">
                              {m.sheet_details_notesStatistics_hold({}, { locale })}
                            </TableCell>
                            <TableCell className="num">{numberFormat.format(sheet.noteCounts.hold ?? 0)}</TableCell>
                          </TableRow>

                          <TableRow>
                            <TableCell component="th" scope="row" className="!pl-8">
                              {m.sheet_details_notesStatistics_slide({}, { locale })}
                            </TableCell>
                            <TableCell className="num">{numberFormat.format(sheet.noteCounts.slide ?? 0)}</TableCell>
                          </TableRow>

                          <TableRow>
                            <TableCell component="th" scope="row" className="!pl-8">
                              {m.sheet_details_notesStatistics_touch({}, { locale })}
                            </TableCell>
                            <TableCell className="num">{numberFormat.format(sheet.noteCounts.touch ?? 0)}</TableCell>
                          </TableRow>

                          <TableRow>
                            <TableCell component="th" scope="row" className="!pl-8">
                              {m.sheet_details_notesStatistics_break({}, { locale })}
                            </TableCell>
                            <TableCell className="num">{numberFormat.format(sheet.noteCounts.break ?? 0)}</TableCell>
                          </TableRow>

                          <TableRow>
                            <TableCell component="th" scope="row" className="!pl-8">
                              {m.sheet_details_notesStatistics_total({}, { locale })}
                            </TableCell>
                            <TableCell className="num font-semibold">
                              {sheet.noteCounts.total === undefined || sheet.noteCounts.total === null
                                ? '—'
                                : numberFormat.format(sheet.noteCounts.total)}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </>
                  )}

                  <TableRow>
                    <TableCell component="th" scope="row">
                      {m.sheet_details_regionalAvailability({}, { locale })}
                    </TableCell>
                    <TableCell>
                      <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
                        {SERVER_BADGE_ORDER.map((region) => [region, sheet.serverIds.includes(region)] as const).map(
                          ([region, available]) => (
                            <li
                              key={region}
                              className={clsx(
                                'inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.05em]',
                                available
                                  ? 'bg-status-positive text-on-accent'
                                  : 'border border-solid border-black/25 text-fg-2 line-through',
                              )}
                            >
                              {available && <IconMdiCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                              {region}
                              <span className="sr-only">
                                {available
                                  ? m.sheet_details_available({}, { locale })
                                  : m.sheet_details_unavailable({}, { locale })}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell component="th" scope="row">
                      {m.sheet_details_unlock_label({}, { locale })}
                    </TableCell>
                    <TableCell>
                      {sheet.isLocked ? (
                        <span className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-status-warning px-1.5 py-0.5 text-xs font-semibold text-on-accent">
                          <IconMdiLock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                          {m.sheet_details_unlock_required({}, { locale })}
                        </span>
                      ) : (
                        m.sheet_details_unlock_notRequired({}, { locale })
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <SectionHeader>{m.sheet_comments_title({}, { locale })}</SectionHeader>
            <SheetComments sheet={sheet} />
          </div>

          {!sheet.isTypeUtage && (
            <div className="flex flex-col gap-1">
              <SectionHeader>{m.sheet_details_achievementToRating_title({}, { locale })}</SectionHeader>
              <AchievementRatingTable
                internalLevelValue={sheet.internalLevelValue}
                currentAchievementRate={currentAchievementRate}
              />
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  )
})
SheetDialogContent.displayName = 'memo(SheetDialogContent)'

const SheetInternalLevelHistory: FC<{
  sheet: FlattenedSheet
}> = ({ sheet }) => {
  const locale = useLocale()
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
          // accumulating spread is fine here since we don't really have a lot of versions
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
    <div className="scroll-fade-x overflow-x-auto" ref={scrollableContainer}>
      {multiverInternalLevelValues.filter((v) => v.internalLevelValue !== undefined).length > 0 ? (
        <Table size="small" className="mb-4">
          <TableHead>
            <TableRow>
              {multiverInternalLevelValues.map(({ version, available }) => (
                <TableCell
                  key={version}
                  className={clsx(
                    appVersion === version && 'bg-amber-200 dark:bg-[rgb(251_191_36/0.2)]',
                    !available && 'opacity-50',
                  )}
                >
                  <img
                    src={
                      version === 'MAGiCAL'
                        ? '/images/versions/magical/logo.webp'
                        : `https://shama.dxrating.net/images/version-title/${VERSION_SLUG_MAP.get(version)}.png`
                    }
                    alt={m.sheet_versionTitleAlt({ version }, { locale })}
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
                  className={clsx(
                    appVersion === version && 'bg-amber-200 dark:bg-[rgb(251_191_36/0.2)]',
                    !available && 'opacity-50',
                  )}
                >
                  {internalLevelValue === undefined ? (
                    <div className="text-fg-2">{available ? '—' : '／'}</div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold num">{internalLevelValue?.toFixed(1)}</span>
                      {delta !== undefined && <DeltaArrow delta={delta} />}
                    </div>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <p className="m-0 text-fg-2 px-1">{m.sheet_internalLevelHistory_empty({}, { locale })}</p>
      )}
    </div>
  )
}