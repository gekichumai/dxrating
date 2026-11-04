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
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { useAppContext } from '../context/useAppContext'
import { readActiveSaveId, useActiveSave } from './ActiveSaveContext'
import { useCloudSaveActions } from './cloudSaveActions'
import { pruneExpiredCloudBackup } from './cloudMigration'
import type { InternalLevelResolver } from './collapseScoreRecords'

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

const OFFER_OFF: CloudMigrationOffer = {
  available: false,
  localCount: 0,
  open: () => {},
}

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

/**
 * Marks a control that stays when the migration offer goes, to take the focus from the offer's controls (the Import
 * menu button, the account menu's cloud save heading)
 */
export const MIGRATION_FOCUS_RETURN_ATTRIBUTE = 'data-cloud-migration-focus-return'

/**
 * Moves the focus to the nearest control marked {@link MIGRATION_FOCUS_RETURN_ATTRIBUTE}: within `scope` (the menu
 * or the panel the offer was in) while it is still there, else anywhere on the page. For when the focused control
 * is about to go (the offer was dismissed, or the migration made a cloud save active).
 */
export function focusMigrationReturnTarget(scope: Element | null) {
  if (typeof document === 'undefined') return
  const selector = `[${MIGRATION_FOCUS_RETURN_ATTRIBUTE}]`
  const target =
    (scope?.isConnected ? scope.querySelector<HTMLElement>(selector) : null) ??
    document.querySelector<HTMLElement>(selector)
  target?.focus()
}

const focusScopeOf = (element: Element | null) =>
  element?.closest('[role="dialog"], [role="presentation"], .MuiAlert-root') ?? null

export const CloudMigrationProvider: FC<
  PropsWithChildren<{
    localRepository: LocalEntriesSource
    /** The calculator's internal level resolver, so duplicate entries are uploaded as the calculator reads them */
    resolveInternalLevel?: InternalLevelResolver | null
  }>
> = ({ localRepository, resolveInternalLevel, children }) => {
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

  // The control that opened the dialog is gone once the migration made a cloud save active: the focus goes to a
  // control that stays, near where it was, instead of falling back to the page
  const opener = useRef<{ element: HTMLElement | null; scope: Element | null }>({ element: null, scope: null })
  const open = useCallback(() => {
    const element = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
    opener.current = { element, scope: focusScopeOf(element) }
    setDialogOpen(true)
  }, [])
  const close = useCallback(() => {
    setDialogOpen(false)
    const { element, scope } = opener.current
    // After the dialog unmounted and gave the focus back
    setTimeout(() => {
      // Gone, or never focused (a click that does not focus buttons, as in Safari)
      if (!element?.isConnected || element === document.body) focusMigrationReturnTarget(scope)
    }, 0)
  }, [])
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
            onClose={close}
            entries={localEntries}
            region={region}
            api={actions.migration}
            storage={storage}
            resolveInternalLevel={resolveInternalLevel}
            onActivate={(saveId) => setActiveSaveId(saveId)}
          />
        </Suspense>
      )}
    </CloudMigrationContext.Provider>
  )
}