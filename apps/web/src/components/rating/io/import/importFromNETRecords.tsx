import type { VersionEnum } from '@gekichumai/dxdata'
import { normalizeMaimaiNetRecords, type SongCatalog } from '@gekichumai/maimai-domain'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import * as Sentry from '@sentry/tanstackstart-react'
import i18n from 'i18next'
import { WebHaptics } from 'web-haptics'
import type { ScoreRepository } from '@/models/scores/ScoreRepository'
import type { MusicRecord, RecentRecord } from './ImportFromNETRecordsListItem'
import { importResultToPlayEntries } from './importResultToPlayEntries'
import {
  NET_IMPORT_ERROR_I18N,
  NetImportError,
  type NetImportErrorCode,
  isNetImportErrorCode,
  unexpectedErrorSubtitle,
} from './netImportErrorFeedback'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { netImportProgress } from './netImportProgressStore'
import {
  FETCH_STATE_PROGRESS,
  type FetchNetRecordProgressState,
  isFetchNetRecordProgressState,
} from './netImportStages'
import { importFallbackEntries, importPath, runServerImportToEnd, summarizeImportJob } from './cloudImport'
import { ImportAlreadyRunningError, ServerImportFailedError } from '@/models/scores/cloudImports'

const ERROR_CODE_I18N = NET_IMPORT_ERROR_I18N

const ERROR_CODE_DETAIL_I18N: Partial<Record<NetImportErrorCode, string>> = {
  AIME_CARD_UNAVAILABLE: 'rating-calculator:io.import.net-records.errors.aime-card-unavailable-detail',
}

export type { FetchNetRecordProgressState }

interface AuthParams {
  region: 'jp' | 'intl'
  username: string
  password: string
}

const fetchNetRecords = async (
  authParams: AuthParams,
  onProgress?: (state: FetchNetRecordProgressState, progress: number) => void,
): Promise<{ music: MusicRecord[]; recent: RecentRecord[] }> => {
  const { region, username, password } = authParams

  return new Promise((resolve, reject) => {
    fetchEventSource(`https://miruku.dxrating.net/functions/fetch-net-records/v1/${region}`, {
      method: 'POST',
      body: JSON.stringify({ id: username, password }),
      openWhenHidden: true,
      headers: {
        'Content-Type': 'application/json',
      },
      onmessage: (message) => {
        const event = message.event as 'progress' | 'data' | 'error' | ''
        if (!event) {
          return
        }

        if (event === 'progress') {
          const { state } = JSON.parse(message.data) as {
            state: FetchNetRecordProgressState
          }
          onProgress?.(state, FETCH_STATE_PROGRESS[state])
        } else if (event === 'data') {
          const data = JSON.parse(message.data) as {
            music: MusicRecord[]
            recent: RecentRecord[]
          }
          resolve(data)
        } else if (event === 'error') {
          const parsed = JSON.parse(message.data) as { code?: string; error?: string }
          if (parsed.code && isNetImportErrorCode(parsed.code)) {
            reject(new NetImportError(parsed.code, parsed.error))
          } else {
            reject(new Error(parsed.error ?? 'unknown error'))
          }
        } else {
          console.warn('Unknown event', message)
        }
      },
      onerror: (ev) => {
        reject(new Error(ev))
        throw new Error(ev)
      },
      async onopen(response) {
        if (response.ok) {
          onProgress?.('ready', FETCH_STATE_PROGRESS.ready)
          return // everything's good
        }

        // if the server responds with an error, DO NOT retry
        throw new Error(await response.text())
      },
    })
  })
}

const haptics = new WebHaptics()

export const NET_IMPORT_LAST_SUCCESS_KEY = 'net-import-last-success'
export const NET_IMPORT_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

let importInFlight = false

export interface CloudNetImportOptions {
  /** `auto` for the automatic import; `user` when the user asked (the default with credentials passed in) */
  trigger?: 'user' | 'auto'
  /** The automatic import's key, one per save and 15 minutes (`autoNetImportKey`) */
  idempotencyKey?: string
}

export const importFromNETRecords = async (
  catalog: SongCatalog,
  repository: ScoreRepository,
  mode: 'merge' | 'replace',
  onProgress?: (state: FetchNetRecordProgressState, progress: number) => void,
  authParams?: AuthParams,
  cloud?: CloudNetImportOptions,
) => {
  if (importInFlight) {
    console.warn('[importFromNETRecords] Import already in progress, skipping duplicate call')
    return
  }
  importInFlight = true
  const importStart = performance.now()
  const trigger = authParams ? 'manual' : 'automatic'
  captureAnalyticsEvent('rating_import_started', {
    source: 'maimai_net',
    mode,
    trigger,
  })

  const t = i18n.t.bind(i18n)
  netImportProgress.update({ status: 'running', stage: 'ready', progress: 0 })
  try {
    const storedAuthParams = (() => {
      const stored = localStorage.getItem('import-net-records')
      if (!stored) return null
      const parsed = JSON.parse(stored) as {
        region: 'jp' | 'intl'
        username: string
        password: string
      }
      return parsed
    })()
    const params = authParams ?? storedAuthParams
    if (!params) {
      captureAnalyticsEvent('rating_import_failed', {
        source: 'maimai_net',
        duration_ms: performance.now() - importStart,
        error_code: 'missing_credentials',
        mode,
        trigger,
      })
      netImportProgress.finish('error', t('rating-calculator:io.import.net-records.no-credentials'))
      return
    }
    const { region, username, password } = params

    const path = importPath(repository)
    if (path === 'server') {
      // A cloud save: the server signs in to maimai NET, fetches and merges the records (verified), and this page
      // pulls them after. The same progress toast; the records never pass through the browser
      let stage: FetchNetRecordProgressState = 'ready'
      const job = await runServerImportToEnd(
        repository,
        'maimai-net',
        {
          region,
          id: username,
          password,
          trigger: cloud?.trigger ?? (authParams ? 'user' : 'auto'),
          idempotencyKey: cloud?.idempotencyKey,
        },
        (progress) => {
          if (isFetchNetRecordProgressState(progress.stage)) stage = progress.stage
          onProgress?.(stage, progress.progress)
          netImportProgress.update({ status: 'running', stage, progress: progress.progress })
        },
      ).catch((error: unknown) => {
        // The stream's error codes are the ones the old route reports
        if (error instanceof ServerImportFailedError && isNetImportErrorCode(error.code)) {
          throw new NetImportError(error.code, error.message)
        }
        throw error
      })
      haptics.trigger('success')
      netImportProgress.finish(
        'success',
        <div className="flex flex-col">
          <span>
            {t('rating-calculator:cloud-save.import.success', {
              source: `maimai NET (${String(region).toUpperCase()})`,
              summary: summarizeImportJob(job, t),
            })}
          </span>
        </div>,
      )
      localStorage.setItem(NET_IMPORT_LAST_SUCCESS_KEY, Date.now().toString())
      captureAnalyticsEvent('rating_import_succeeded', {
        source: 'maimai_net',
        duration_ms: performance.now() - importStart,
        entry_count: job.counts.fetched,
        warning_count: 0,
        mode,
        trigger,
        region,
      })
      return
    }

    const data = await fetchNetRecords({ region, username, password }, (state, progress) => {
      onProgress?.(state, progress)
      netImportProgress.update({ status: 'running', stage: state, progress })
    })
    const importResult = normalizeMaimaiNetRecords(catalog, data.music)
    const entries = importResultToPlayEntries(importResult)
    for (const warning of importResult.warnings) {
      console.warn('[importFromNETRecords]', warning.message, warning.row)
    }

    console.log(entries, mode)

    if (path === 'client-fallback') {
      // A cloud save with server imports off (§7.4): the one case where this page uploads what it fetched. The
      // records are client_reported and never shown as verified
      await importFallbackEntries(repository, entries, 'maimai-net', {
        claimedSource: `maimai-net-${region}`,
        trigger: cloud?.trigger ?? (authParams ? 'user' : 'auto'),
        idempotencyKey: cloud?.idempotencyKey,
      })
    } else {
      // merge: a higher achievement replaces the saved values of its chart
      await repository.applyImport(entries, { source: 'maimai-net', mode })
    }

    const lastRecord = data.recent.at(0)
    const lastRecordPlayedAt = lastRecord?.play.timestamp ? new Date(lastRecord.play.timestamp).toLocaleString() : null
    haptics.trigger('success')
    netImportProgress.finish(
      'success',
      <div className="flex flex-col">
        <span>
          {t('rating-calculator:io.import.net-records.imported', {
            count: entries.length,
            region: String(region).toUpperCase(),
          })}
        </span>
        {lastRecord && (
          <>
            <span className="text-sm text-zinc-500">{t('rating-calculator:io.import.net-records.latest-play')}</span>
            <span className="text-xs text-zinc-500">
              {lastRecord.sheet.songId} [{lastRecord.sheet.type}]
            </span>
            {lastRecordPlayedAt && (
              <span className="text-xs text-zinc-500">
                {t('rating-calculator:io.import.net-records.date', {
                  date: lastRecordPlayedAt,
                })}
              </span>
            )}
            {/* <span className="text-xs text-zinc-500">
                      Rating:
                    </span> */}
          </>
        )}
      </div>,
    )

    localStorage.setItem(NET_IMPORT_LAST_SUCCESS_KEY, Date.now().toString())

    const duration = performance.now() - importStart
    captureAnalyticsEvent('rating_import_succeeded', {
      source: 'maimai_net',
      duration_ms: duration,
      entry_count: entries.length,
      warning_count: importResult.warnings.length,
      mode,
      trigger,
      region,
    })

    Sentry.metrics.distribution('net_import.duration', duration, {
      unit: 'millisecond',
      attributes: { region, mode },
    })
    Sentry.metrics.distribution('net_import.entries', entries.length, {
      unit: 'none',
      attributes: { region, mode },
    })
  } catch (error) {
    captureAnalyticsEvent('rating_import_failed', {
      source: 'maimai_net',
      duration_ms: performance.now() - importStart,
      error_code: error instanceof NetImportError ? error.code.toLowerCase() : 'unknown',
      mode,
      trigger,
    })
    Sentry.metrics.count('net_import.failure', 1, {
      attributes: { error_code: error instanceof NetImportError ? error.code : 'unknown' },
    })

    const title =
      error instanceof NetImportError
        ? t(ERROR_CODE_I18N[error.code])
        : error instanceof ImportAlreadyRunningError
          ? t('rating-calculator:cloud-save.import.errors.already-running')
          : t('rating-calculator:io.import.net-records.errors.unknown')
    const translatedDetail = error instanceof NetImportError ? ERROR_CODE_DETAIL_I18N[error.code] : undefined
    const subtitle = translatedDetail
      ? t(translatedDetail)
      : error instanceof ImportAlreadyRunningError
        ? null
        : unexpectedErrorSubtitle(error)

    netImportProgress.finish(
      'error',
      <div className="flex min-w-0 max-w-[22rem] flex-col items-start gap-0.5">
        <div className="font-bold leading-snug">{title}</div>
        {subtitle && (
          <div className="break-words text-left text-xs font-normal leading-relaxed text-zinc-500">{subtitle}</div>
        )}
      </div>,
    )
  } finally {
    importInFlight = false
  }
}