import type { ReactNode } from 'react'
import type { FetchNetRecordProgressState } from './importFromNETRecords'

export interface NetImportProgress {
  status: 'running' | 'success' | 'error'
  progress: number
  stage: FetchNetRecordProgressState
  message?: ReactNode
}

let snapshot: NetImportProgress | null = null
const listeners = new Set<() => void>()

export const netImportProgress = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => null,
  update(next: NetImportProgress | null) {
    snapshot = next
    listeners.forEach((listener) => listener())
  },
  finish(status: 'success' | 'error', message: ReactNode) {
    this.update({
      status,
      progress: status === 'success' ? 1 : (snapshot?.progress ?? 0),
      stage: status === 'success' ? 'concluded' : (snapshot?.stage ?? 'ready'),
      message,
    })
  },
}