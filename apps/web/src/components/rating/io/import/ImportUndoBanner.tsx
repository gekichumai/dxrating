import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
} from '@mui/material'
import { type FC, useCallback, useId, useState, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'
import MdiClose from '~icons/mdi/close'
import MdiUndo from '~icons/mdi/undo'
import { getImportUndoStore, undoDiscardsLaterChanges, undoLastImport } from '@/models/scores/importReview'
import type { ImportUndoSnapshot } from '@/models/scores/importUndo'
import { useHydrated, useScoreEntries, useScoreRepository } from '@/models/scores/useScoreRepository'
import { importSourceLabel } from './importSourceLabel'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const noopSubscribe = () => () => {}
const noSnapshot = () => null

const formatDateTime = (timestamp: number, locale: string) => {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
  } catch {
    return new Date(timestamp).toLocaleString()
  }
}

/**
 * The undo of the last import into the local save, while it can be undone (`IMPORT_UNDO_WINDOW_MS`). Rendered after
 * hydration only: the snapshot is in the browser storage, and the times are in the visitor's time zone.
 */
export const ImportUndoBanner: FC = () => {
  const locale = useLocale()
  const repository = useScoreRepository()
  const hydrated = useHydrated()
  // Re-renders on every save change, so an edit while the confirmation is open updates its warning
  useScoreEntries()
  const store = hydrated ? getImportUndoStore(repository) : null
  const snapshot: ImportUndoSnapshot | null = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store ? store.get : noSnapshot,
    noSnapshot,
  )
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const titleId = useId()

  const handleUndo = useCallback(() => {
    setConfirming(false)
    const result = undoLastImport(repository)
    if (result === 'restored') toast.success(m.ratingCalculator_io_import_undo_done({}, { locale }))
    else if (result === 'failed') toast.error(m.ratingCalculator_io_import_undo_failed({}, { locale }))
    else toast.error(m.ratingCalculator_io_import_undo_expired({}, { locale }))
  }, [repository, locale])

  if (!store || !snapshot || snapshot.id === dismissedId) return null

  const source = importSourceLabel(locale, snapshot.source)
  const discardsLaterChanges = confirming && undoDiscardsLaterChanges(repository, snapshot)

  return (
    <>
      <Alert
        severity="success"
        icon={<MdiUndo />}
        className="mt-2 w-full"
        classes={{ message: 'w-full min-w-0', action: 'items-start pt-1' }}
        action={
          <IconButton
            size="small"
            aria-label={m.ratingCalculator_io_import_undo_dismiss({}, { locale })}
            onClick={() => setDismissedId(snapshot.id)}
          >
            <MdiClose />
          </IconButton>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-60">
            <div className="font-semibold text-fg-1">
              {m.ratingCalculator_io_import_undo_title(
                {
                  count: snapshot.importedCount,
                  source,
                  time: formatDateTime(snapshot.createdAt, locale),
                },
                { locale },
              )}
            </div>
            <div className="text-sm text-secondary">
              {m.ratingCalculator_io_import_undo_description(
                {
                  time: formatDateTime(store.expiresAt(snapshot), locale),
                },
                { locale },
              )}
            </div>
          </div>
          <Button size="small" variant="outlined" color="inherit" onClick={() => setConfirming(true)}>
            {m.ratingCalculator_io_import_undo_button({}, { locale })}
          </Button>
        </div>
      </Alert>

      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby={titleId} maxWidth="xs">
        <DialogTitle id={titleId}>{m.ratingCalculator_io_import_undo_confirm_title({}, { locale })}</DialogTitle>
        <DialogContent className="flex flex-col gap-2">
          <DialogContentText>
            {m.ratingCalculator_io_import_undo_confirm_description(
              {
                count: snapshot.previousEntries.length,
                source,
              },
              { locale },
            )}
          </DialogContentText>
          {discardsLaterChanges && (
            <DialogContentText className="text-danger font-semibold">
              {m.ratingCalculator_io_import_undo_confirm_laterChanges({}, { locale })}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} color="inherit">
            {m.ratingCalculator_io_import_undo_confirm_cancel({}, { locale })}
          </Button>
          <Button onClick={handleUndo} variant="contained" color={discardsLaterChanges ? 'error' : 'primary'}>
            {m.ratingCalculator_io_import_undo_confirm_submit({}, { locale })}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}