import type { CloudExportSave } from '@/models/scores/ratingEntriesFile'

/**
 * Asks which save of a "Download my data" file to import, when it has more than one. `ExportSavePickerDialog`
 * answers; without one mounted the first save is taken.
 */

export interface ExportSavePickerRequest {
  saves: readonly CloudExportSave[]
  resolve: (save: CloudExportSave | null) => void
}

let pending: ExportSavePickerRequest | null = null
let hosts = 0
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of [...listeners]) listener()
}

export const exportSavePicker = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot: (): ExportSavePickerRequest | null => pending,
  getServerSnapshot: (): ExportSavePickerRequest | null => null,
  registerHost() {
    hosts++
    return () => {
      hosts--
    }
  },
  /** The save to import, or `null` when the user cancels; a file with one save needs no answer */
  request(saves: readonly CloudExportSave[]): Promise<CloudExportSave | null> {
    if (saves.length <= 1 || hosts === 0) return Promise.resolve(saves[0] ?? null)
    pending?.resolve(null)
    return new Promise((resolve) => {
      const request: ExportSavePickerRequest = {
        saves,
        resolve: (save) => {
          if (pending === request) pending = null
          resolve(save)
          emit()
        },
      }
      pending = request
      emit()
    })
  },
}