import { SERVER_BADGE_ORDER } from '@/models/constants'
import { getArcadeSongsUrl } from '@/catalog/arcadeSongs'
import { CommentActions } from '../comments/CommentActions'
import { filterComments, useCommentVisibility } from '../comments/commentVisibility'
import { MULTIVER_AVAILABLE_VERSIONS, TypeEnum, VERSION_ID_MAP, VERSION_SLUG_MAP } from '@gekichumai/dxdata'
import { Button, CircularProgress, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material'
import clsx from 'clsx'
import {
  type FC,
  type PropsWithChildren,
  type ReactNode,
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import useSWR from 'swr'
import { match } from 'ts-pattern'
import MdiCheck from '~icons/mdi/check'
import MdiClose from '~icons/mdi/close'
import MdiComment from '~icons/mdi/comment'
import MdiLock from '~icons/mdi/lock'
import { apiClient as client } from '../../lib/orpc'
import { useAuth } from '../../hooks/useAuth'
import { useAppContextDXDataVersion } from '../../models/context/useAppContext'
import type { FlattenedSheet } from '../../songs'
import { formatSheetReleaseDateParts } from '../../utils/dateFormatting'
import { useRenderedAt } from '../../utils/renderEnvironment'
import { MaterialSurface } from '../global/MaterialSurface'
import { AchievementRatingTable } from '../sheet/AchievementRatingTable'
import { SheetTags } from '../sheet/tags/SheetTags'
import { SheetDifficulty } from '../sheet/SheetListItem'
import { SHEET_TYPE_IMAGES, getSheetTypeAltTextKey } from '../sheet/sheetTypeAssets'

// Hairline dividers only: rows carry no fill, so the glass panel behind them stays the one surface
const tableSx = {
  '& .MuiTableCell-root': { borderColor: 'var(--glass-border)', color: 'var(--fg-1)' },
  '& .MuiTableHead-root .MuiTableCell-root': { color: 'var(--fg-2)', fontWeight: 400 },
  '& .MuiTableBody-root .MuiTableRow-root:last-of-type > .MuiTableCell-root': { borderBottom: 0 },
  // Cells align with the panel heading instead of MUI's 16px gutter
  '& .MuiTableCell-root:first-of-type': { paddingLeft: 0 },
  '& .MuiTableCell-root:last-of-type': { paddingRight: 0 },
} as const

/** A glass panel with its own heading, so heading navigation reaches every part of the chart page */
const Section: FC<PropsWithChildren<{ title: ReactNode }>> = ({ title, children }) => {
  const headingId = useId()
  return (
    <MaterialSurface as="section" className="p-3 flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="section-title m-0">
        {title}
      </h2>
      {children}
    </MaterialSurface>
  )
}

const DeltaArrow: FC<{ delta: number }> = ({ delta }) => {
  const { t } = useTranslation(['sheet'])
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
      ? t('sheet:internal-level-history.delta.increased')
      : delta < 0
        ? t('sheet:internal-level-history.delta.decreased')
        : t('sheet:internal-level-history.delta.unchanged')

  return (
    <img
      src={`https://shama.dxrating.net/images/rating-arrow/${direction}.png`}
      alt={altText}
      className="w-6 h-6 touch-callout-none"
      draggable={false}
    />
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
    <div className="relative overflow-x-auto -mx-1 px-1" ref={scrollableContainer}>
      {multiverInternalLevelValues.filter((v) => v.internalLevelValue !== undefined).length > 0 ? (
        <Table size="small" sx={tableSx}>
          <TableHead>
            <TableRow>
              {multiverInternalLevelValues.map(({ version, available }) => (
                <TableCell
                  key={version}
                  aria-current={appVersion === version ? 'true' : undefined}
                  className={clsx(appVersion === version && 'bg-accent-subtle')}
                >
                  <img
                    src={
                      version === 'MAGiCAL'
                        ? '/images/versions/magical/logo.webp'
                        : `https://shama.dxrating.net/images/version-title/${VERSION_SLUG_MAP.get(version)}.png`
                    }
                    alt={t('sheet:version-title-alt', { version })}
                    className={clsx(
                      'h-40.75px w-83px min-w-[83px] -ml-1 touch-callout-none',
                      !available && 'opacity-50',
                    )}
                    draggable={false}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              {multiverInternalLevelValues.map(({ version, internalLevelValue, available, delta }) => (
                <TableCell key={version} className={clsx(appVersion === version && 'bg-accent-subtle')}>
                  {internalLevelValue === undefined ? (
                    <span className="text-fg-2">
                      <span aria-hidden>{available ? '—' : '／'}</span>
                      <span className="sr-only">
                        {available
                          ? t('sheet:internal-level-history.no-value')
                          : t('sheet:internal-level-history.not-in-version')}
                      </span>
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold tabular-nums">{internalLevelValue?.toFixed(1)}</span>
                      {delta !== undefined && <DeltaArrow delta={delta} />}
                    </div>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <p className="m-0 text-sm text-fg-2">{t('sheet:internal-level-history.empty')}</p>
      )}
    </div>
  )
}

const Comments: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t, i18n } = useTranslation(['auth', 'sheet', 'global'])
  const { session, user, ensureAuthenticated, openLoginDialog, LoginDialog } = useAuth()
  const visibility = useCommentVisibility(user?.id)
  const [content, setContent] = useState<string>('')
  const {
    data: comments,
    isLoading: isLoadingComments,
    mutate,
  } = useSWR(['comments.list', user?.id ?? null, sheet.songId, sheet.type, sheet.difficulty], async () => {
    const data = await client.comments.list({
      songId: sheet.songId,
      sheetId: sheet.id,
      sheetType: sheet.type,
      sheetDifficulty: sheet.difficulty,
    })
    return data.map((c) => ({
      ...c,
      // ISO, so it is a valid <time dateTime> and parses the same everywhere
      created_at: new Date(c.created_at).toISOString(),
    }))
  })
  // Comments load on the client only, so formatting them in the app locale cannot cause a hydration mismatch
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
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
    await client.comments.create(payload)

    mutate()
    setContent('')
  }, [sheet, content, ensureAuthenticated])

  const visibleComments = filterComments(comments ?? [], visibility)

  return (
    <div className="flex flex-col gap-3">
      <LoginDialog />

      <div className="flex gap-2 relative">
        <TextField
          className="flex-grow"
          placeholder={t('sheet:comments.placeholder')}
          inputProps={{ 'aria-label': t('sheet:comments.input-label') }}
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
          <button
            type="button"
            className="absolute inset-0 z-1 flex items-center justify-center m-0 p-0 border-0 font-inherit bg-white/60 backdrop-blur-sm rounded-[var(--radius-md)] cursor-pointer"
            onClick={openLoginDialog}
          >
            <span className="font-semibold text-sm text-accent-strong underline underline-offset-2">
              {t('auth:form.login-or-register-to-comment')}
            </span>
          </button>
        )}
      </div>

      {isLoadingComments ? (
        <div className="h-16 rounded-[var(--radius-md)] bg-black/5 motion-safe:animate-pulse" />
      ) : visibleComments.length > 0 ? (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {visibleComments.map((comment) => (
            <li key={comment.id} className="glass-inset flex flex-col gap-1 px-3 py-2">
              <div className="text-fg-2 flex items-center gap-1">
                <span className="text-sm font-semibold text-fg-1">
                  {comment.display_name ?? t('sheet:comments.anonymous')}
                </span>
                <CommentActions comment={comment} />
                <time className="text-xs ml-auto tabular-nums" dateTime={comment.created_at}>
                  {dateFormat.format(new Date(comment.created_at))}
                </time>
              </div>
              <div className="text-sm text-fg-1 break-words">
                {comment.content.split('\n').map((line) => (
                  <p key={line} className="m-0">
                    {line ?? ' '}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass-inset m-0 p-4 text-center text-sm text-fg-2">{t('sheet:comments.empty')}</p>
      )}
    </div>
  )
}

/** The utage kind (宴 / 協 / 光 …) as the list shows it, since utage charts have no difficulty pill */
const UtageKindBadge: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const kind = sheet.difficulty.replace(/[【】]/g, '')
  return (
    <span className="relative inline-flex h-26px w-95.875px items-center justify-center select-none">
      <img
        src={SHEET_TYPE_IMAGES[TypeEnum.UTAGE]}
        alt=""
        className="absolute inset-0 h-full w-full object-contain touch-callout-none"
        draggable={false}
      />
      <span className="relative text-white text-xs text-shadow-[0_1px_0_rgb(0_0_0_/_0.35)]" aria-hidden>
        {kind}
      </span>
      <span className="sr-only">{`${t(getSheetTypeAltTextKey(sheet.type))} ${kind}`}</span>
    </span>
  )
}

/** The chart at a glance: difficulty and internal level, release date and tags (sits under the chart tabs) */
export const SongSheetSummary: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t, i18n } = useTranslation(['sheet'])
  const renderedAt = useRenderedAt()
  const releaseDateParts = useMemo(
    () => (sheet.releaseDate ? formatSheetReleaseDateParts(sheet.releaseDate, i18n.language, renderedAt) : null),
    [sheet.releaseDate, i18n.language, renderedAt],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {sheet.isTypeUtage ? (
          <>
            <UtageKindBadge sheet={sheet} />
            <span className="text-2xl font-semibold leading-tight tabular-nums text-fg-1">{sheet.level}</span>
          </>
        ) : (
          <>
            <SheetDifficulty difficulty={sheet.difficulty} serverIds={sheet.serverIds} isLocked={sheet.isLocked} />
            <span className="text-2xl font-semibold leading-tight tabular-nums text-fg-1">
              {sheet.internalLevelValue.toFixed(1)}
            </span>
          </>
        )}
      </div>

      {sheet.isTypeUtage && sheet.comment && (
        <p className="glass-inset m-0 self-start inline-flex items-start gap-1.5 px-2 py-1 text-sm text-fg-1">
          <MdiComment aria-hidden className="h-3.5 w-3.5 shrink-0 mt-0.75 text-fg-2" />
          <span lang="ja">{sheet.comment}</span>
        </p>
      )}

      {releaseDateParts && <p className="m-0 text-sm text-fg-2">{t('sheet:release-date', releaseDateParts)}</p>}

      <div className="flex flex-wrap gap-1">
        <SheetTags sheet={sheet} />
      </div>
    </div>
  )
}

const DetailRow: FC<PropsWithChildren<{ label: ReactNode; indent?: boolean }>> = ({ label, indent, children }) => (
  <TableRow>
    <TableCell component="th" scope="row" className={clsx('w-2/5 !font-normal !text-fg-2', indent && '!pl-4')}>
      {label}
    </TableCell>
    <TableCell>{children}</TableCell>
  </TableRow>
)

const NOTE_TYPES = ['tap', 'hold', 'slide', 'touch', 'break'] as const

const RegionalAvailability: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap items-center gap-1.5">
      {SERVER_BADGE_ORDER.map((region) => {
        const available = sheet.serverIds.includes(region)
        const label = region.toUpperCase()
        return (
          <li
            key={region}
            className={clsx(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[var(--radius-sm)] text-xs font-semibold tracking-wide whitespace-nowrap',
              available
                ? 'bg-status-positive text-on-accent border border-solid border-transparent'
                : 'border border-solid border-black/30 text-fg-2',
            )}
          >
            {available ? (
              <MdiCheck aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <MdiClose aria-hidden className="h-3.5 w-3.5" />
            )}
            <span aria-hidden className={clsx(!available && 'line-through')}>
              {label}
            </span>
            <span className="sr-only">
              {available
                ? t('sheet:details.region-available', { region: label })
                : t('sheet:details.region-unavailable', { region: label })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export const SongSheetContent: FC<{ sheet: FlattenedSheet; isActive?: boolean }> = memo(
  ({ sheet, isActive = true }) => {
    const { t } = useTranslation(['sheet', 'song', 'global'])
    const designer = sheet.noteDesigner && sheet.noteDesigner !== '-' ? sheet.noteDesigner : '—'

    return (
      <>
        {!sheet.isTypeUtage && (
          <Section title={t('sheet:internal-level-history.title')}>
            <InternalLevelHistory sheet={sheet} />
          </Section>
        )}

        <Section title={t('sheet:details.title')}>
          <Table size="small" sx={tableSx} className="tabular-nums">
            <TableBody>
              <DetailRow label={t('sheet:details.category')}>
                <span lang="ja">{sheet.category}</span>
              </DetailRow>
              <DetailRow label={t('sheet:details.song-artist')}>
                <span lang="ja" translate="no" className="break-words">
                  {sheet.artist}
                </span>
              </DetailRow>
              {sheet.version && <DetailRow label={t('song:hub.version')}>{sheet.version}</DetailRow>}

              {!sheet.isTypeUtage && (
                <>
                  <DetailRow label={t('sheet:details.bpm')}>{sheet.bpm}</DetailRow>
                  <DetailRow label={t('sheet:details.chart-designer')}>
                    <span translate="no" className="break-words">
                      {designer}
                    </span>
                  </DetailRow>

                  {(sheet.noteCounts.tap ?? 0) > 0 && (
                    <>
                      <DetailRow label={t('sheet:details.notes-statistics.title')}>
                        <span className="font-semibold">{sheet.noteCounts.total?.toLocaleString('en-US')}</span>
                      </DetailRow>
                      {NOTE_TYPES.map((noteType) => (
                        <DetailRow key={noteType} label={t(`sheet:details.notes-statistics.${noteType}`)} indent>
                          {sheet.noteCounts[noteType] ?? 0}
                        </DetailRow>
                      ))}
                    </>
                  )}
                </>
              )}

              <DetailRow label={t('sheet:details.regional-availability')}>
                <RegionalAvailability sheet={sheet} />
              </DetailRow>

              <DetailRow label={t('sheet:details.unlock')}>
                {sheet.isLocked ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-status-warning text-on-accent text-xs font-semibold">
                    <MdiLock aria-hidden className="h-3.5 w-3.5" />
                    {t('sheet:details.unlock-status.required')}
                  </span>
                ) : (
                  t('sheet:details.unlock-status.not-required')
                )}
              </DetailRow>
            </TableBody>
          </Table>

          <p className="m-0 text-xs text-fg-2 text-right">
            <Trans
              i18nKey="sheet:details.credits"
              components={{
                link: (
                  <a href={getArcadeSongsUrl(sheet)} rel="noreferrer" target="_blank" className="link">
                    arcade-songs.zetaraku.dev
                  </a>
                ),
              }}
            />
          </p>
        </Section>

        {isActive && (
          <Section title={t('sheet:comments.title')}>
            <Comments sheet={sheet} />
          </Section>
        )}

        {!sheet.isTypeUtage && (
          <Section title={t('sheet:details.achievement-to-rating.title')}>
            <AchievementRatingTable internalLevelValue={sheet.internalLevelValue} />
          </Section>
        )}
      </>
    )
  },
)
SongSheetContent.displayName = 'SongSheetContent'