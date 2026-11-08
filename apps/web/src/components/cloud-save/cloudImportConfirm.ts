/**
 * Asks how a file import goes into a cloud save. On the local save a file import replaces the save, as it always
 * has; a cloud save has no "replace" (§5.3 rule 5): the import is merged (each chart keeps its better score), or the
 * user explicitly clears the save first. `CloudImportConfirmDialog` answers; without one mounted the import merges.
 */

export type CloudImportChoice = 'merge' | 'replace'

export interface CloudImportConfirmRequest {
  /** The records that will be imported */
  count: number
  /** Entries that will be left out: no chart matches them, or the server rejects a value */
  leftOut: number
  resolve: (choice: CloudImportChoice | null) => void
}

let pending: CloudImportConfirmRequest | null = null
let hosts = 0
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of [...listeners]) listener()
}

export const cloudImportConfirm = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot: (): CloudImportConfirmRequest | null => pending,
  getServerSnapshot: (): CloudImportConfirmRequest | null => null,
  /** A dialog that answers requests mounted; returns its unmount */
  registerHost() {
    hosts++
    return () => {
      hosts--
    }
  },
  /** Resolves the user's choice, or `null` when they cancel */
  request(count: number, leftOut = 0): Promise<CloudImportChoice | null> {
    if (hosts === 0) return Promise.resolve('merge')
    // A newer request replaces an unanswered one, which is cancelled
    pending?.resolve(null)
    return new Promise((resolve) => {
      const request: CloudImportConfirmRequest = {
        count,
        leftOut,
        resolve: (choice) => {
          if (pending === request) pending = null
          resolve(choice)
          emit()
        },
      }
      pending = request
      emit()
    })
  },
}