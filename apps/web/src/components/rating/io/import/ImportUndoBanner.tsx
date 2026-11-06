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
import { useTranslation } from 'react-i18next'
import MdiClose from '~icons/mdi/close'
import MdiUndo from '~icons/mdi/undo'
import { getImportUndoStore, undoDiscardsLaterChanges, undoLastImport } from '@/models/scores/importReview'
import type { ImportUndoSnapshot } from '@/models/scores/importUndo'
import { useHydrated, useScoreEntries, useScoreRepository } from '@/models/scores/useScoreRepository'
import { importSourceLabel } from './importSourceLabel'

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
  const { t, i18n } = useTranslation(['rating-calculator'])
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
    if (undoLastImport(repository)) {
      toast.success(t('rating-calculator:io.import.undo.done'))
    } else {
      toast.error(t('rating-calculator:io.import.undo.expired'))
    }
  }, [repository, t])

  if (!store || !snapshot || snapshot.id === dismissedId) return null

  const source = importSourceLabel(t, snapshot.source)
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
            aria-label={t('rating-calculator:io.import.undo.dismiss')}
            onClick={() => setDismissedId(snapshot.id)}
          >
            <MdiClose />
          </IconButton>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-60">
            <div className="font-semibold text-fg-1">
              {t('rating-calculator:io.import.undo.title', {
                count: snapshot.importedCount,
                source,
                time: formatDateTime(snapshot.createdAt, i18n.language),
              })}
            </div>
            <div className="text-sm text-secondary">
              {t('rating-calculator:io.import.undo.description', {
                time: formatDateTime(store.expiresAt(snapshot), i18n.language),
              })}
            </div>
          </div>
          <Button size="small" variant="outlined" color="inherit" onClick={() => setConfirming(true)}>
            {t('rating-calculator:io.import.undo.button')}
          </Button>
        </div>
      </Alert>

      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby={titleId} maxWidth="xs">
        <DialogTitle id={titleId}>{t('rating-calculator:io.import.undo.confirm.title')}</DialogTitle>
        <DialogContent className="flex flex-col gap-2">
          <DialogContentText>
            {t('rating-calculator:io.import.undo.confirm.description', {
              count: snapshot.previousEntries.length,
              source,
            })}
          </DialogContentText>
          {discardsLaterChanges && (
            <DialogContentText className="text-danger font-semibold">
              {t('rating-calculator:io.import.undo.confirm.later-changes')}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} color="inherit">
            {t('rating-calculator:io.import.undo.confirm.cancel')}
          </Button>
          <Button onClick={handleUndo} variant="contained" color={discardsLaterChanges ? 'error' : 'primary'}>
            {t('rating-calculator:io.import.undo.confirm.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}