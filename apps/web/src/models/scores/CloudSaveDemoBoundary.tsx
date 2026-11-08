import { type FC, lazy, type PropsWithChildren, Suspense, useEffect, useMemo, useState } from 'react'
import { useSongCatalog } from '../../catalog/CatalogContext'
// Already in the account menu's bundle
import { CloudSaveConsentDialog } from '../../components/cloud-save/CloudSaveOptIn'
import { ActiveSaveContext, useActiveSave } from './ActiveSaveContext'
import { CloudMigrationContext, type CloudMigrationOffer, useCloudMigrationOffer } from './CloudMigrationContext'
import { type CloudSaveActions, CloudSaveActionsContext, useCloudSaveActions } from './cloudSaveActions'
import { type CloudSaveUi, CloudSaveUiContext, useCloudSaveUi } from './CloudSaveUiContext'
import type { DemoCloudSaveFlow, DemoCloudSaveState } from './demoCloudSave'
import { LocalScoreRepository } from './LocalScoreRepository'
import type { WebScoreRepository } from './ScoreRepository'
import { isScoreRepositoryOverrideAllowed, ScoreRepositoryOverrideProvider, useHydrated } from './useScoreRepository'

/**
 * Dev and preview demos of the cloud save surfaces (screenshots): `?demoCloudSave=1` swaps in an in-memory cloud
 * save with every kind of provenance, sync issues, saves and import history; `&demoCloudSaveState=offline` (or
 * `syncing`, `error`) shows that sync state. `&demoCloudSaveFlow=migrate` (no cloud save yet), `migrate-existing` (a
 * save another device made) or `opt-in` opens the first sign-in migration dialog or the beta consent, over in-memory
 * requests (the account menu's cloud save section also shows the opt-in switch). `choose-save` opens "Use a cloud
 * save" as on an empty browser (no local records, no cloud save chosen), listing the demo's saves; choosing one
 * changes nothing. Nothing leaves the browser. Production hosts and the native shell ignore
 * it (the `?demoScores=1` host check), and it applies after hydration only, so server-rendered HTML never changes.
 */

export const DEMO_CLOUD_SAVE_PARAM = 'demoCloudSave'
export const DEMO_CLOUD_SAVE_STATE_PARAM = 'demoCloudSaveState'
export const DEMO_CLOUD_SAVE_FLOW_PARAM = 'demoCloudSaveFlow'

const DEMO_FLOWS: readonly DemoCloudSaveFlow[] = ['migrate', 'migrate-existing', 'opt-in', 'choose-save']

/** The demo flow a page URL asks for (with `demoCloudSave=1` on a host that may show demos), or `null` */
export function requestedCloudSaveDemoFlow(url: string): DemoCloudSaveFlow | null {
  if (!requestedCloudSaveDemo(url)) return null
  const flow = new URL(url).searchParams.get(DEMO_CLOUD_SAVE_FLOW_PARAM) as DemoCloudSaveFlow | null
  return flow && DEMO_FLOWS.includes(flow) ? flow : null
}

const CloudMigrationDialog = lazy(() =>
  import('../../components/cloud-save/CloudMigrationDialog').then((module) => ({
    default: module.CloudMigrationDialog,
  })),
)

const ChooseCloudSaveDialog = lazy(() =>
  import('../../components/cloud-save/ChooseCloudSaveDialog').then((module) => ({
    default: module.ChooseCloudSaveDialog,
  })),
)

/** The choose-save flow is of an empty browser: nothing to back up */
const NO_OFFER: CloudMigrationOffer = { available: false, localCount: 0, open: () => {} }

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
  actions: CloudSaveActions | null
}

export const CloudSaveDemoBoundary: FC<PropsWithChildren<{ url?: string }>> = ({ url, children }) => {
  const hydrated = useHydrated()
  const pageUrl = url ?? (hydrated && typeof window !== 'undefined' ? window.location.href : null)
  const requested = pageUrl ? requestedCloudSaveDemo(pageUrl) : null
  const flow = pageUrl ? requestedCloudSaveDemoFlow(pageUrl) : null
  const catalog = useSongCatalog()
  const [demo, setDemo] = useState<LoadedDemo | null>(null)
  const parentUi = useCloudSaveUi()

  useEffect(() => {
    if (!requested) {
      setDemo(null)
      return
    }
    let cancelled = false
    void import('./demoCloudSave').then(({ createDemoCloudSave, createDemoCloudSaveActions }) => {
      if (cancelled) return
      const loaded = createDemoCloudSave(catalog, requested)
      setDemo({ ...loaded, actions: flow ? createDemoCloudSaveActions(flow) : null })
    })
    return () => {
      cancelled = true
    }
  }, [requested, flow, catalog])

  const parentActiveSave = useActiveSave()
  const parentActions = useCloudSaveActions()
  const parentOffer = useCloudMigrationOffer()
  const [flowDialogOpen, setFlowDialogOpen] = useState(true)
  const isMigrationFlow = flow === 'migrate' || flow === 'migrate-existing'
  const isChooseFlow = flow === 'choose-save'
  const cloudSaveOn = isMigrationFlow || isChooseFlow
  const demoEntries = useMemo(() => (demo ? demo.repository.entries() : []), [demo])
  // The choose-save flow is of an empty browser: an empty local save, whatever this browser has
  const emptyLocal = useMemo(() => (isChooseFlow ? LocalScoreRepository.inMemory([]) : null), [isChooseFlow])

  // The migration and choose-save flows show a local save with no cloud save chosen; the opt-in flow, a user the
  // beta is offered to. The choose-save flow lists the demo's saves, and choosing one changes nothing.
  const activeSave = useMemo(() => {
    if (!demo || !flow) return parentActiveSave
    return {
      ...parentActiveSave,
      userId: parentActiveSave.userId ?? 'demo',
      features: { cloudSave: cloudSaveOn, serverImports: cloudSaveOn, optInAvailable: flow === 'opt-in' },
      refreshFeatures: () => {},
      ...(isChooseFlow
        ? {
            kind: 'local' as const,
            decided: true,
            saveId: null,
            cloudRepository: null,
            listSaves: demo.ui.listSaves,
            setActiveSaveId: () => {},
          }
        : {}),
    }
  }, [demo, flow, cloudSaveOn, isChooseFlow, parentActiveSave])
  const offer = useMemo<CloudMigrationOffer>(
    () =>
      demo && isMigrationFlow
        ? { available: true, localCount: demoEntries.length, open: () => setFlowDialogOpen(true) }
        : demo && isChooseFlow
          ? NO_OFFER
          : parentOffer,
    [demo, isMigrationFlow, isChooseFlow, demoEntries.length, parentOffer],
  )

  // The same tree either way, so a demo arriving after hydration does not remount the page
  return (
    <ActiveSaveContext.Provider value={activeSave}>
      <CloudSaveActionsContext.Provider value={demo?.actions ?? parentActions}>
        <CloudMigrationContext.Provider value={offer}>
          <ScoreRepositoryOverrideProvider
            repository={demo ? (emptyLocal ?? demo.repository) : undefined}
            url={pageUrl ?? undefined}
          >
            <CloudSaveUiContext.Provider value={flow ? parentUi : (demo?.ui ?? parentUi)}>
              {children}
            </CloudSaveUiContext.Provider>
          </ScoreRepositoryOverrideProvider>
          {demo?.actions && flowDialogOpen && (
            <Suspense fallback={null}>
              {isChooseFlow ? (
                <ChooseCloudSaveDialog
                  open
                  onClose={() => setFlowDialogOpen(false)}
                  listSaves={demo.ui.listSaves}
                  onChoose={() => {}}
                />
              ) : isMigrationFlow ? (
                <CloudMigrationDialog
                  open
                  onClose={() => setFlowDialogOpen(false)}
                  entries={demoEntries}
                  region="jp"
                  api={demo.actions.migration}
                  storage={null}
                  onActivate={() => {}}
                />
              ) : (
                <CloudSaveConsentDialog
                  open
                  onCancel={() => setFlowDialogOpen(false)}
                  onAgree={() => setFlowDialogOpen(false)}
                />
              )}
            </Suspense>
          )}
        </CloudMigrationContext.Provider>
      </CloudSaveActionsContext.Provider>
    </ActiveSaveContext.Provider>
  )
}