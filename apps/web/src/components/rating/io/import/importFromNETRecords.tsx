import type { VersionEnum } from '@gekichumai/dxdata'
import { normalizeMaimaiNetRecords, type SongCatalog } from '@gekichumai/maimai-domain'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import * as Sentry from '@/lib/telemetry'
import { WebHaptics } from 'web-haptics'
import toast from 'react-hot-toast'
import { reviewAndApplyImport } from '@/models/scores/importReview'
import type { WebScoreRepository } from '@/models/scores/ScoreRepository'
import type { MusicRecord, RecentRecord } from './ImportFromNETRecordsListItem'
import { importResultToPlayEntries } from './importResultToPlayEntries'
import { NetImportError, type NetImportErrorCode, unexpectedErrorSubtitle } from './netImportErrorFeedback'
import type { PlainMessage } from '@/i18n/message'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { m } from '@/paraglide/messages'
import { netImportProgress } from './netImportProgressStore'

const ERROR_CODE_MESSAGES: Record<NetImportErrorCode, PlainMessage> = {
  NET_MAINTENANCE: m.ratingCalculator_io_import_netRecords_errors_maintenance,
  INVALID_CREDENTIALS: m.ratingCalculator_io_import_netRecords_errors_invalidCredentials,
  AIME_CARD_UNAVAILABLE: m.ratingCalculator_io_import_netRecords_errors_aimeCardUnavailable,
  UNKNOWN_ERROR: m.ratingCalculator_io_import_netRecords_errors_unknown,
  INTERNAL_ERROR: m.ratingCalculator_io_import_netRecords_errors_internal,
  TOKEN_ERROR: m.ratingCalculator_io_import_netRecords_errors_token,
}

const ERROR_CODE_DETAIL_MESSAGES: Partial<Record<NetImportErrorCode, PlainMessage>> = {
  NET_MAINTENANCE: m.ratingCalculator_io_import_netRecords_errors_maintenanceDetail,
  AIME_CARD_UNAVAILABLE: m.ratingCalculator_io_import_netRecords_errors_aimeCardUnavailableDetail,
}

export type FetchNetRecordProgressState =
  | 'ready'
  | 'auth:in-progress'
  | 'auth:succeeded'
  | 'fetch:recent:in-progress'
  | 'fetch:recent:completed'
  | 'fetch:music:in-progress:basic'
  | 'fetch:music:in-progress:advanced'
  | 'fetch:music:in-progress:expert'
  | 'fetch:music:in-progress:master'
  | 'fetch:music:in-progress:remaster'
  | 'fetch:music:in-progress:utage'
  | 'fetch:music:completed'
  | 'concluded'

const FETCH_STATE_PROGRESS: Record<FetchNetRecordProgressState, number> = {
  ready: 0.01,
  'auth:in-progress': 0.08,
  'auth:succeeded': 0.2,
  'fetch:recent:in-progress': 0.2,
  'fetch:recent:completed': 0.3,
  'fetch:music:in-progress:basic': 0.4,
  'fetch:music:in-progress:advanced': 0.5,
  'fetch:music:in-progress:expert': 0.6,
  'fetch:music:in-progress:master': 0.7,
  'fetch:music:in-progress:remaster': 0.8,
  'fetch:music:in-progress:utage': 0.9,
  'fetch:music:completed': 1,
  concluded: 1,
}

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
          if (parsed.code && parsed.code in ERROR_CODE_MESSAGES) {
            reject(new NetImportError(parsed.code as NetImportErrorCode, parsed.error))
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

export const importFromNETRecords = async (
  catalog: SongCatalog,
  repository: WebScoreRepository,
  mode: 'merge' | 'replace',
  onProgress?: (state: FetchNetRecordProgressState, progress: number) => void,
  authParams?: AuthParams,
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
      netImportProgress.finish('error', m.ratingCalculator_io_import_netRecords_noCredentials())
      return
    }
    const { region, username, password } = params
    const data = await fetchNetRecords({ region, username, password }, (state, progress) => {
      onProgress?.(state, progress)
      netImportProgress.update({ status: 'running', stage: state, progress })
    })
    const importResult = normalizeMaimaiNetRecords(catalog, data.music)
    const entries = importResultToPlayEntries(importResult)
    for (const warning of importResult.warnings) {
      console.warn('[importFromNETRecords]', warning.message, warning.row)
    }

    // merge: a higher achievement replaces the saved values of its chart. A manual import is always previewed; an
    // automatic one only when it would lower or remove a saved score
    const { applied } = await reviewAndApplyImport(
      repository,
      entries,
      { source: 'maimai-net', mode },
      { trigger: trigger === 'manual' ? 'manual' : 'automatic' },
    )
    if (!applied) {
      captureAnalyticsEvent('rating_import_failed', {
        source: 'maimai_net',
        duration_ms: performance.now() - importStart,
        error_code: 'cancelled_by_user',
        mode,
        trigger,
      })
      netImportProgress.update(null)
      toast(m.ratingCalculator_io_import_review_cancelled(), { id: 'import-review-cancelled' })
      return
    }

    const lastRecord = data.recent.at(0)
    const lastRecordPlayedAt = lastRecord?.play.timestamp ? new Date(lastRecord.play.timestamp).toLocaleString() : null
    haptics.trigger('success')
    netImportProgress.finish(
      'success',
      <div className="flex flex-col">
        <span>
          {m.ratingCalculator_io_import_netRecords_imported({
            count: entries.length,
            region: String(region).toUpperCase(),
          })}
        </span>
        {lastRecord && (
          <>
            <span className="text-sm text-secondary">{m.ratingCalculator_io_import_netRecords_latestPlay()}</span>
            <span className="text-xs text-secondary">
              {lastRecord.sheet.songId} [{lastRecord.sheet.type}]
            </span>
            {lastRecordPlayedAt && (
              <span className="text-xs text-secondary">
                {m.ratingCalculator_io_import_netRecords_date({
                  date: lastRecordPlayedAt,
                })}
              </span>
            )}
            {/* <span className="text-xs text-secondary">
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
        ? ERROR_CODE_MESSAGES[error.code]()
        : m.ratingCalculator_io_import_netRecords_errors_unknown()
    const translatedDetail = error instanceof NetImportError ? ERROR_CODE_DETAIL_MESSAGES[error.code] : undefined
    const subtitle = translatedDetail ? translatedDetail() : unexpectedErrorSubtitle(error)

    netImportProgress.finish(
      'error',
      <div className="flex min-w-0 max-w-[22rem] flex-col items-start gap-0.5">
        <div className="font-bold leading-snug">{title}</div>
        {subtitle && (
          <div className="break-words text-left text-xs font-normal leading-relaxed text-secondary">{subtitle}</div>
        )}
      </div>,
    )
  } finally {
    importInFlight = false
  }
}