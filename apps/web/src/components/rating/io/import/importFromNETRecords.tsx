import { type DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { CircularProgress } from '@mui/material'
import cloneDeep from 'lodash-es/cloneDeep'
import i18n from 'i18next'
import posthog from 'posthog-js'
import toast from 'react-hot-toast'
import type { ListActions } from 'react-use/lib/useList'
import IconMdiCheck from '~icons/mdi/check'
import IconMdiClose from '~icons/mdi/close'
import { WebHaptics } from 'web-haptics'
import { type FlattenedSheet, canonicalIdFromParts } from '../../../../songs'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import type { ComboFlag, PlayEntry, SyncFlag } from '../../RatingCalculatorAddEntryForm'
import type { MusicRecord, RecentRecord } from './ImportFromNETRecordsListItem'

type NetImportErrorCode = 'NET_MAINTENANCE' | 'INVALID_CREDENTIALS' | 'UNKNOWN_ERROR' | 'INTERNAL_ERROR' | 'TOKEN_ERROR'

const ERROR_CODE_I18N: Record<NetImportErrorCode, string> = {
  NET_MAINTENANCE: 'rating-calculator:io.import.net-records.errors.maintenance',
  INVALID_CREDENTIALS: 'rating-calculator:io.import.net-records.errors.invalid-credentials',
  UNKNOWN_ERROR: 'rating-calculator:io.import.net-records.errors.unknown',
  INTERNAL_ERROR: 'rating-calculator:io.import.net-records.errors.internal',
  TOKEN_ERROR: 'rating-calculator:io.import.net-records.errors.token',
}

class NetImportError extends Error {
  code: NetImportErrorCode
  constructor(code: NetImportErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
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
          if (parsed.code && parsed.code in ERROR_CODE_I18N) {
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

const NET_COMBO_FLAG_MAP: Record<string, ComboFlag> = {
  fullCombo: 'fc',
  'fullCombo+': 'fcp',
  allPerfect: 'ap',
  'allPerfect+': 'app',
}

const NET_SYNC_FLAG_MAP: Record<string, SyncFlag> = {
  syncPlay: 'sync',
  fullSync: 'fs',
  'fullSync+': 'fsp',
  fullSyncDX: 'fsd',
  'fullSyncDX+': 'fsdp',
}

function extractComboFlag(flags: string[]): ComboFlag {
  for (const flag of flags) {
    if (flag in NET_COMBO_FLAG_MAP) return NET_COMBO_FLAG_MAP[flag]
  }
  return null
}

function extractSyncFlag(flags: string[]): SyncFlag {
  for (const flag of flags) {
    if (flag in NET_SYNC_FLAG_MAP) return NET_SYNC_FLAG_MAP[flag]
  }
  return null
}

const haptics = new WebHaptics()

export const NET_IMPORT_LAST_SUCCESS_KEY = 'net-import-last-success'
export const NET_IMPORT_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

let importInFlight = false

export const importFromNETRecords = async (
  sheets: FlattenedSheet[],
  modifyEntries: ListActions<PlayEntry>,
  mode: 'merge' | 'replace',
  onProgress?: (state: FetchNetRecordProgressState, progress: number) => void,
) => {
  if (importInFlight) {
    console.warn('[importFromNETRecords] Import already in progress, skipping duplicate call')
    return
  }
  importInFlight = true
  posthog?.capture('netimport_started')

  const t = i18n.t.bind(i18n)
  const toastId = toast.loading(t('rating-calculator:io.import.net-records.importing'), {
    icon: <CircularProgress size="1rem" thickness={5} />,
  })
  try {
    const stored = localStorage.getItem('import-net-records')
    if (!stored) {
      toast.error(t('rating-calculator:io.import.net-records.no-credentials'), {
        id: toastId,
      })
      throw new Error('No credentials stored.')
    }
    const parsed = JSON.parse(stored)
    const { region, username, password } = parsed
    const data = await fetchNetRecords({ region, username, password }, (state, progress) => {
      onProgress?.(state, progress)
      toast.loading(
        <div className="flex flex-col items-start min-w-[16rem]">
          <div className="font-bold">{t('rating-calculator:io.import.net-records.importing')}</div>
          <div className="font-mono text-xs font-light text-zinc-500">{state}</div>
        </div>,
        {
          id: toastId,
          icon: <CircularProgress variant="determinate" value={progress * 100} size="1rem" thickness={5} />,
        },
      )
    })
    const entries = data.music
      .filter((entry) => {
        return entry.sheet.difficulty !== 'utage'
      })
      .map((record) => {
        const flags = Array.isArray(record.achievement.flags) ? record.achievement.flags : []
        return {
          sheetId: canonicalIdFromParts(
            record.sheet.songId,
            (
              {
                standard: TypeEnum.STD,
                dx: TypeEnum.DX,
                utage: TypeEnum.UTAGE,
              } as const
            )[record.sheet.type],
            record.sheet.difficulty as DifficultyEnum,
          ),
          achievementRate: record.achievement.rate / 10000,
          comboFlag: extractComboFlag(flags),
          syncFlag: extractSyncFlag(flags),
        }
      })
      .filter((entry) => {
        const exists = sheets?.find((sheet) => sheet.id === entry.sheetId)
        if (!exists) {
          console.warn('[ImportFromNETRecordsDialogContent] sheet not found', entry)
        }
        return exists
      })

    console.log(entries, mode)

    if (mode === 'replace') {
      modifyEntries.set(entries)
    } else if (mode === 'merge') {
      modifyEntries.set((prev) => {
        const cloned = cloneDeep(prev)
        for (const entry of entries) {
          const existed = cloned.find((item) => item.sheetId === entry.sheetId)
          if (!existed) {
            cloned.push(entry)
          } else if (entry.achievementRate > existed.achievementRate) {
            existed.achievementRate = entry.achievementRate
            existed.comboFlag = entry.comboFlag
            existed.syncFlag = entry.syncFlag
          }
        }
        return cloned
      })
    }

    const lastRecord = data.recent.at(0)
    haptics.trigger('success')
    toast.success(
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
            {lastRecord.play.timestamp && (
              <span className="text-xs text-zinc-500">
                {t('rating-calculator:io.import.net-records.date', {
                  date: new Date(lastRecord.play.timestamp).toLocaleString(),
                })}
              </span>
            )}
            {/* <span className="text-xs text-zinc-500">
                      Rating:
                    </span> */}
          </>
        )}
      </div>,
      {
        id: toastId,
        icon: <IconMdiCheck className="h-4 w-4 text-green-5" />,
        duration: 20000,
      },
    )

    localStorage.setItem(NET_IMPORT_LAST_SUCCESS_KEY, Date.now().toString())

    posthog?.capture('netimport_succeeded', {
      region,
      count: entries.length,
    })
  } catch (error) {
    const errorMessage =
      error instanceof NetImportError
        ? t(ERROR_CODE_I18N[error.code])
        : t('rating-calculator:io.import.net-records.error', { error: formatErrorMessage(error) })
    toast.error(errorMessage, {
      id: toastId,
      icon: <IconMdiClose className="h-4 w-4 text-red-5 shrink-0" />,
      duration: 20000,
    })
  } finally {
    importInFlight = false
  }
}