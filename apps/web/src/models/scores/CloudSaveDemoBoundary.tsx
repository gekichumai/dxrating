import { type FC, type PropsWithChildren, useEffect, useState } from 'react'
import { useSongCatalog } from '../../catalog/CatalogContext'
import { type CloudSaveUi, CloudSaveUiContext, useCloudSaveUi } from './CloudSaveUiContext'
import type { DemoCloudSaveState } from './demoCloudSave'
import type { WebScoreRepository } from './ScoreRepository'
import { isScoreRepositoryOverrideAllowed, ScoreRepositoryOverrideProvider, useHydrated } from './useScoreRepository'

/**
 * Dev and preview demos of the cloud save surfaces (screenshots): `?demoCloudSave=1` swaps in an in-memory cloud
 * save with every kind of provenance, sync issues, saves and import history; `&demoCloudSaveState=offline` (or
 * `syncing`, `error`) shows that sync state. Nothing leaves the browser. Production hosts and the native shell ignore
 * it (the `?demoScores=1` host check), and it applies after hydration only, so server-rendered HTML never changes.
 */

export const DEMO_CLOUD_SAVE_PARAM = 'demoCloudSave'
export const DEMO_CLOUD_SAVE_STATE_PARAM = 'demoCloudSaveState'

const DEMO_STATES: readonly DemoCloudSaveState[] = ['idle', 'syncing', 'offline', 'error']

/** The demo state a page URL asks for, or `null` when it asks for none or its host may not show demos */
export function requestedCloudSaveDemo(url: string): DemoCloudSaveState | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.searchParams.get(DEMO_CLOUD_SAVE_PARAM) !== '1') return null
  if (!isScoreRepositoryOverrideAllowed(url)) return null
  const state = parsed.searchParams.get(DEMO_CLOUD_SAVE_STATE_PARAM) as DemoCloudSaveState | null
  return state && DEMO_STATES.includes(state) ? state : 'idle'
}

interface LoadedDemo {
  repository: WebScoreRepository
  ui: CloudSaveUi
}

export const CloudSaveDemoBoundary: FC<PropsWithChildren<{ url?: string }>> = ({ url, children }) => {
  const hydrated = useHydrated()
  const pageUrl = url ?? (hydrated && typeof window !== 'undefined' ? window.location.href : null)
  const requested = pageUrl ? requestedCloudSaveDemo(pageUrl) : null
  const catalog = useSongCatalog()
  const [demo, setDemo] = useState<LoadedDemo | null>(null)
  const parentUi = useCloudSaveUi()

  useEffect(() => {
    if (!requested) {
      setDemo(null)
      return
    }
    let cancelled = false
    void import('./demoCloudSave').then(({ createDemoCloudSave }) => {
      if (!cancelled) setDemo(createDemoCloudSave(catalog, requested))
    })
    return () => {
      cancelled = true
    }
  }, [requested, catalog])

  // The same tree either way, so a demo arriving after hydration does not remount the page
  return (
    <ScoreRepositoryOverrideProvider repository={demo?.repository} url={pageUrl ?? undefined}>
      <CloudSaveUiContext.Provider value={demo?.ui ?? parentUi}>{children}</CloudSaveUiContext.Provider>
    </ScoreRepositoryOverrideProvider>
  )
}