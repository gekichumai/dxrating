import {
  createContext,
  type FC,
  lazy,
  type PropsWithChildren,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { useAppContext } from '../context/useAppContext'
import { readActiveSaveId, useActiveSave } from './ActiveSaveContext'
import { useCloudSaveActions } from './cloudSaveActions'
import { pruneExpiredCloudBackup } from './cloudMigration'

/**
 * Whether to offer the first sign-in migration (design §10) and how to start it. It is offered, never run, when all
 * of these hold:
 * - the visitor is signed in and `GET /me/features` says `cloudSave`;
 * - no cloud save is chosen on this browser (`active-save-id`), and the local save is the active one;
 * - the local save has entries.
 *
 * Nothing here sends a request: the save list is read when the user opens the dialog. Signed out, or with cloud
 * save off, `available` is `false` and nothing renders.
 */

export interface CloudMigrationOffer {
  available: boolean
  /** Records in the local save */
  localCount: number
  /** Opens the "Back up to cloud" dialog */
  open(): void
}

const OFFER_OFF: CloudMigrationOffer = { available: false, localCount: 0, open: () => {} }

export const CloudMigrationContext = createContext<CloudMigrationOffer>(OFFER_OFF)

export const useCloudMigrationOffer = () => useContext(CloudMigrationContext)

/** The local save's entries, live */
export interface LocalEntriesSource {
  entries(): readonly PlayEntry[]
  subscribe(cb: () => void): () => void
}

const CloudMigrationDialog = lazy(() =>
  import('../../components/cloud-save/CloudMigrationDialog').then((module) => ({
    default: module.CloudMigrationDialog,
  })),
)

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const EMPTY: readonly PlayEntry[] = []

export const CloudMigrationProvider: FC<PropsWithChildren<{ localRepository: LocalEntriesSource }>> = ({
  localRepository,
  children,
}) => {
  const activeSave = useActiveSave()
  const actions = useCloudSaveActions()
  const { region } = useAppContext()
  const [dialogOpen, setDialogOpen] = useState(false)
  const localEntries = useSyncExternalStore(
    useCallback((onChange) => localRepository.subscribe(onChange), [localRepository]),
    () => localRepository.entries(),
    () => EMPTY,
  )

  // The backup the migration keeps lasts 30 days
  useEffect(() => pruneExpiredCloudBackup(browserLocalStorage()), [])

  const { userId, features, decided, kind, setActiveSaveId } = activeSave
  const storage = browserLocalStorage()
  const available =
    !!userId &&
    features?.cloudSave === true &&
    decided &&
    kind === 'local' &&
    localEntries.length > 0 &&
    !readActiveSaveId(storage, userId)

  // A sign-out, or cloud save turned off, closes the dialog
  useEffect(() => {
    if (!userId || features?.cloudSave !== true) setDialogOpen(false)
  }, [userId, features?.cloudSave])

  const open = useCallback(() => setDialogOpen(true), [])
  const offer = useMemo<CloudMigrationOffer>(
    () => (available ? { available, localCount: localEntries.length, open } : OFFER_OFF),
    [available, localEntries.length, open],
  )

  return (
    <CloudMigrationContext.Provider value={offer}>
      {children}
      {dialogOpen && userId && (
        <Suspense fallback={null}>
          <CloudMigrationDialog
            open
            onClose={() => setDialogOpen(false)}
            entries={localEntries}
            region={region}
            api={actions.migration}
            storage={storage}
            onActivate={(saveId) => setActiveSaveId(saveId)}
          />
        </Suspense>
      )}
    </CloudMigrationContext.Provider>
  )
}