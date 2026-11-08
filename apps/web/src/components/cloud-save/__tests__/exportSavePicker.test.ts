import { afterEach, describe, expect, it } from 'vitest'
import type { CloudExportSave } from '@/models/scores/ratingEntriesFile'
import { exportSavePicker } from '../exportSavePicker'

const save = (id: string) => ({ id, name: id, region: 'jp', entries: [] }) as unknown as CloudExportSave
const SAVES = [save('dsav_a'), save('dsav_b')]

let unregister: (() => void) | null = null

afterEach(() => {
  exportSavePicker.getSnapshot()?.resolve(null)
  unregister?.()
  unregister = null
})

describe('exportSavePicker', () => {
  it('without a dialog mounted, takes the first save', async () => {
    await expect(exportSavePicker.request(SAVES)).resolves.toBe(SAVES[0])
    expect(exportSavePicker.getSnapshot()).toBeNull()
  })

  it('a file with one save needs no answer', async () => {
    unregister = exportSavePicker.registerHost()
    await expect(exportSavePicker.request([SAVES[1]!])).resolves.toBe(SAVES[1])
    expect(exportSavePicker.getSnapshot()).toBeNull()
  })

  it('resolves with the save picked, or null on cancel, and clears the request', async () => {
    unregister = exportSavePicker.registerHost()
    const picked = exportSavePicker.request(SAVES)
    exportSavePicker.getSnapshot()!.resolve(SAVES[1]!)
    await expect(picked).resolves.toBe(SAVES[1])
    expect(exportSavePicker.getSnapshot()).toBeNull()

    const cancelled = exportSavePicker.request(SAVES)
    exportSavePicker.getSnapshot()!.resolve(null)
    await expect(cancelled).resolves.toBeNull()
    expect(exportSavePicker.getSnapshot()).toBeNull()
  })

  it('a second request cancels the pending one and takes its place', async () => {
    unregister = exportSavePicker.registerHost()
    let notified = 0
    const unsubscribe = exportSavePicker.subscribe(() => notified++)
    try {
      const first = exportSavePicker.request(SAVES)
      const firstRequest = exportSavePicker.getSnapshot()
      const second = exportSavePicker.request(SAVES)

      await expect(first).resolves.toBeNull()
      const secondRequest = exportSavePicker.getSnapshot()
      expect(secondRequest).not.toBeNull()
      expect(secondRequest).not.toBe(firstRequest)

      secondRequest!.resolve(SAVES[0]!)
      await expect(second).resolves.toBe(SAVES[0])
      expect(exportSavePicker.getSnapshot()).toBeNull()
      expect(notified).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  })
})