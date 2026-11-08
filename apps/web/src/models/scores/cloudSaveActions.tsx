import type { ImportJobDTO, ImportResultDTO, SaveDTO, UserFeatures } from '@gekichumai/api-contract'
import { createContext, useContext } from 'react'
import { authClient } from '../../lib/auth-client'
import { MigrationCancelledError, type CloudMigrationApi, type MigrationWriteGuard } from './cloudMigration'

/**
 * The account-level cloud save requests of the web: the first sign-in migration (§10), the beta opt-in (§11.2,
 * §12.1) and "Download my data" (§11.3). They go through the private API client, loaded on first use only, so
 * visitors who never see these surfaces never load it. Replaced in tests and in the dev demo.
 */

/** The privacy terms version the opt-in consent text describes; bump it with the text */
export const CLOUD_SAVE_CONSENT_VERSION = '2026-11-cloud-save-v2'

export interface CloudSaveExportFile {
  blob: Blob
  fileName: string
}

export interface CloudSaveActions {
  migration: CloudMigrationApi
  /**
   * `POST /me/features/cloud-save/opt-in`; resolves the features after opting in. The guard is checked once the
   * private client is ready, right before the request leaves: consent is the account's that gave it
   */
  optIn(consentVersion: string, guard?: MigrationWriteGuard): Promise<UserFeatures>
  /** `GET /me/export` as a file */
  exportData(): Promise<CloudSaveExportFile>
}

const loadPrivateApi = () => import('../../lib/privateApi').then((module) => module.privateApiClient)

/** The client of a write: bound to the guard's account when it names one (§10) */
const loadWriteApi = async (guard?: MigrationWriteGuard) => {
  const module = await import('../../lib/privateApi')
  return guard?.expectedUserId ? module.privateApiClientFor(guard.expectedUserId) : module.privateApiClient
}

/** The server refused a write for another account than the session's: the work stops as if cancelled */
export function isAccountMismatch(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, data } = error as { code?: unknown; data?: unknown }
  return code === 'CONFLICT' && (data as { reason?: unknown } | null | undefined)?.reason === 'ACCOUNT_MISMATCH'
}

/** Sends a guarded write; an `ACCOUNT_MISMATCH` refusal becomes {@link MigrationCancelledError} */
async function sendGuarded<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send()
  } catch (error) {
    if (isAccountMismatch(error)) throw new MigrationCancelledError()
    throw error
  }
}

/** The file name of a `Content-Disposition` header; a dated default otherwise */
export function exportFileName(headers: Record<string, string | string[] | undefined>, now: Date = new Date()) {
  const header = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-disposition')?.[1]
  const value = Array.isArray(header) ? header[0] : header
  const match = value ? /filename="?([^";]+)"?/i.exec(value) : null
  const name = match?.[1]?.trim()
  if (name && /^[\w.-]{1,128}$/.test(name)) return name
  return `dxrating-cloud-export-${now.toISOString().replace(/[:.]/g, '-')}.json`
}

/**
 * The export as a JSON blob. The oRPC client hands a JSON body over parsed; anything else (a `Blob`, a `File`, a
 * string) is used as it is.
 */
export function exportBodyToBlob(body: unknown): Blob {
  if (body instanceof Blob) return body
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Blob([text], { type: 'application/json' })
}

export const defaultCloudSaveActions: CloudSaveActions = {
  migration: {
    async listSaves() {
      const client = await loadPrivateApi()
      return (await client.cloudSave.saves.list()).saves as SaveDTO[]
    },
    async createSave(input, guard) {
      const client = await loadWriteApi(guard)
      await guard?.beforeSend()
      return sendGuarded(async () => (await client.cloudSave.saves.create(input, { signal: guard?.signal })) as SaveDTO)
    },
    async clientImport(input, guard) {
      const client = await loadWriteApi(guard)
      await guard?.beforeSend()
      return sendGuarded(
        async () => (await client.cloudSave.imports.client(input, { signal: guard?.signal })) as ImportResultDTO,
      )
    },
    async replace(input, guard) {
      const client = await loadWriteApi(guard)
      await guard?.beforeSend()
      return sendGuarded(
        async () => (await client.cloudSave.records.replace(input, { signal: guard?.signal })) as ImportResultDTO,
      )
    },
    async getImportJob(jobId) {
      const client = await loadPrivateApi()
      return (await client.cloudSave.imports.get({ jobId })) as ImportJobDTO
    },
    async currentUserId() {
      // Asked of the server: another tab may have signed another account in on this browser
      const { data } = await authClient.getSession({ query: { disableCookieCache: true } })
      return data?.user.id ?? null
    },
  },
  async optIn(consentVersion, guard) {
    const client = await loadWriteApi(guard)
    await guard?.beforeSend()
    return sendGuarded(
      async () => (await client.features.optInCloudSave({ consentVersion }, { signal: guard?.signal })) as UserFeatures,
    )
  },
  async exportData() {
    const client = await loadPrivateApi()
    const result = (await client.cloudSave.export()) as { headers: Record<string, string>; body: unknown }
    return { blob: exportBodyToBlob(result.body), fileName: exportFileName(result.headers ?? {}) }
  },
}

export const CloudSaveActionsContext = createContext<CloudSaveActions>(defaultCloudSaveActions)

export const useCloudSaveActions = () => useContext(CloudSaveActionsContext)

/** Saves a blob as a file through a temporary link (no new origin, no inline script: the CSP is unchanged) */
export function saveBlobAsFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // The download has started from the URL by then
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}