import type { ImportJobDTO, SaveDTO } from '@gekichumai/api-contract'
import type { Provenance } from '@gekichumai/maimai-domain'
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { ScoreRecord, ScoreRepositoryStatus } from './ScoreRepository'

/**
 * What the cloud save surfaces (sync status, sync issues, provenance badges, the save selector, import history)
 * read. `null` whenever the local save is active: with cloud save off (the production default) none of them
 * renders, and none of them sends a request.
 */

/** The parts of a cloud repository the UI uses; `CloudScoreRepository` and the dev demo implement it */
export interface CloudSaveController {
  readonly kind: 'cloud'
  readonly saveId: string
  readonly status: ScoreRepositoryStatus
  subscribe(cb: () => void): () => void
  get(sheetId: string): ScoreRecord | undefined
  /** Applies the user's intent of a sync issue again, over the record the server kept */
  reapplyIssue(issueId: string): void
  /** Forgets a sync issue, keeping the server's record */
  dismissIssue(issueId: string): void
  listImportJobs(limit?: number): Promise<ImportJobDTO[]>
}

export interface CloudSaveUi {
  controller: CloudSaveController
  /** `GET /saves` */
  listSaves(): Promise<readonly SaveDTO[]>
  /** Switches the active save */
  setActiveSaveId(saveId: string): void
}

export const CloudSaveUiContext = createContext<CloudSaveUi | null>(null)

/** The active cloud save's UI hooks, or `null` on the local save */
export const useCloudSaveUi = (): CloudSaveUi | null => useContext(CloudSaveUiContext)

const noopSubscribe = () => () => {}
const nullSnapshot = () => null

/** The sync status of the active cloud save, `null` on the local save */
export function useCloudSaveStatus(): ScoreRepositoryStatus | null {
  const controller = useCloudSaveUi()?.controller ?? null
  const subscribe = useCallback(
    (onChange: () => void) => (controller ? controller.subscribe(onChange) : noopSubscribe()),
    [controller],
  )
  const getSnapshot = useCallback(() => controller?.status ?? null, [controller])
  return useSyncExternalStore(subscribe, getSnapshot, nullSnapshot)
}

/** The provenance of a chart's record in the active cloud save; `null` on the local save or without a record */
export function useCloudRecordProvenance(sheetId: string): Provenance | null {
  const controller = useCloudSaveUi()?.controller ?? null
  const subscribe = useCallback(
    (onChange: () => void) => (controller ? controller.subscribe(onChange) : noopSubscribe()),
    [controller],
  )
  const getSnapshot = useCallback(() => controller?.get(sheetId)?.provenance ?? null, [controller, sheetId])
  return useSyncExternalStore(subscribe, getSnapshot, nullSnapshot)
}