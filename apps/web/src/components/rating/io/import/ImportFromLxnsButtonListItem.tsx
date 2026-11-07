import { useSongCatalogLoader } from '@/catalog/CatalogContext'
import { ImportRegionSupportTag } from '@/components/rating/io/import/ImportRegionSupportTag'
import { normalizeLxnsScores, type SongCatalog } from '@gekichumai/maimai-domain'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from '@mui/material'
import { type FC, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import CarbonCloud from '~icons/carbon/cloud'
import * as Sentry from '@sentry/tanstackstart-react'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { useAuth } from '../../../../hooks/useAuth'
import { apiClient } from '../../../../lib/orpc'
import { WebHaptics } from 'web-haptics'
import { useScoreRepository } from '@/models/scores/useScoreRepository'
import { reviewAndApplyImport } from '@/models/scores/importReview'
import { importResultToPlayEntries } from './importResultToPlayEntries'
import { createRatingImportTracker } from '@/lib/analytics'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const haptics = new WebHaptics()

type ConnectionState = 'loading' | 'not-connected' | 'connected' | 'connecting' | 'importing' | 'error'

const LxnsImportDialogContent: FC<{
  onClose: () => void
}> = ({ onClose }) => {
  const locale = useLocale()
  const repository = useScoreRepository()
  const loadCatalog = useSongCatalogLoader()
  const [state, setState] = useState<ConnectionState>('loading')

  const checkStatus = useCallback(async () => {
    try {
      setState('loading')
      const result = await apiClient.lxns.status()
      setState(result.connected ? 'connected' : 'not-connected')
    } catch {
      setState('not-connected')
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const handleConnect = async () => {
    setState('connecting')
    try {
      const result = await apiClient.lxns.authorize()
      window.location.href = result.url
    } catch (error) {
      toast.error(m.ratingCalculator_io_import_lxns_error({ error: formatErrorMessage(error) }, { locale }))
      setState('not-connected')
    }
  }

  const handleImport = async () => {
    setState('importing')
    const importStart = performance.now()
    const analytics = createRatingImportTracker('lxns')
    try {
      const result = await apiClient.lxns.start()

      const importResult = normalizeLxnsScores(await loadCatalog(), result.scores)
      const entries = importResultToPlayEntries(importResult)
      for (const warning of importResult.warnings) {
        console.warn('[ImportFromLxnsButtonListItem]', warning.message, warning.row)
      }

      const { applied } = await reviewAndApplyImport(
        repository,
        entries,
        { source: 'lxns', mode: 'replace' },
        { trigger: 'manual' },
      )
      if (!applied) {
        analytics.failed('cancelled_by_user')
        setState('connected')
        return
      }
      analytics.succeeded(entries.length, importResult.warnings.length)
      haptics.trigger('success')
      toast.success(m.ratingCalculator_io_import_lxns_success({ count: entries.length }, { locale }))

      Sentry.metrics.distribution('lxns_import.duration', performance.now() - importStart, {
        unit: 'millisecond',
      })
      Sentry.metrics.distribution('lxns_import.entries', entries.length, { unit: 'none' })
      onClose()
    } catch (error) {
      Sentry.metrics.count('lxns_import.failure', 1)
      const msg = String(formatErrorMessage(error))
      if (msg.includes('expired') || msg.includes('reconnect') || msg.includes('authorize')) {
        analytics.failed('reconnect_required')
        toast.error(m.ratingCalculator_io_import_lxns_reconnectRequired({}, { locale }))
        setState('not-connected')
      } else {
        analytics.failed('provider_error')
        toast.error(m.ratingCalculator_io_import_lxns_error({ error: msg }, { locale }))
        setState('connected')
      }
    }
  }

  const handleDisconnect = async () => {
    try {
      await apiClient.lxns.disconnect()
      toast.success(m.ratingCalculator_io_import_lxns_disconnected({}, { locale }))
      setState('not-connected')
    } catch (error) {
      toast.error(m.ratingCalculator_io_import_lxns_error({ error: formatErrorMessage(error) }, { locale }))
    }
  }

  return (
    <>
      <DialogTitle>{m.ratingCalculator_io_import_lxns_title({}, { locale })}</DialogTitle>
      <DialogContent className="flex flex-col items-start gap-3">
        {state === 'loading' && (
          <div className="w-full flex justify-center py-4">
            <CircularProgress size="1.5rem" />
          </div>
        )}

        {state === 'not-connected' && (
          <>
            <p className="text-sm text-secondary">{m.ratingCalculator_io_import_lxns_description({}, { locale })}</p>
          </>
        )}

        {state === 'connected' && (
          <p className="text-sm text-green-700">{m.ratingCalculator_io_import_lxns_connected({}, { locale })}</p>
        )}

        {state === 'connecting' && (
          <div className="w-full flex justify-center items-center gap-2 py-4">
            <CircularProgress size="1rem" />
            <span className="text-sm text-secondary">
              {m.ratingCalculator_io_import_lxns_connecting({}, { locale })}
            </span>
          </div>
        )}

        {state === 'importing' && (
          <div className="w-full flex justify-center items-center gap-2 py-4">
            <CircularProgress size="1rem" />
            <span className="text-sm text-secondary">
              {m.ratingCalculator_io_import_lxns_importing({}, { locale })}
            </span>
          </div>
        )}
      </DialogContent>

      <DialogActions>
        {state === 'connected' && (
          <Button onClick={handleDisconnect} color="inherit" size="small">
            {m.ratingCalculator_io_import_lxns_disconnect({}, { locale })}
          </Button>
        )}

        <div className="flex-1" />

        <Button onClick={onClose}>{m.ratingCalculator_io_import_lxns_close({}, { locale })}</Button>

        {state === 'not-connected' && (
          <Button onClick={handleConnect} variant="contained">
            {m.ratingCalculator_io_import_lxns_connect({}, { locale })}
          </Button>
        )}

        {state === 'connected' && (
          <Button onClick={handleImport} variant="contained">
            {m.ratingCalculator_io_import_lxns_import({}, { locale })}
          </Button>
        )}
      </DialogActions>
    </>
  )
}

export const ImportFromLxnsButtonListItem: FC<{
  onClose: () => void
}> = ({ onClose }) => {
  const locale = useLocale()
  const { isAuthenticated, openLoginDialog, LoginDialog } = useAuth()
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    setOpen(false)
    onClose()
  }

  return (
    <>
      {/* Signed out, the item opens sign-in instead of being a dead end; the menu stays open, so the item is ready
          to use once signed in */}
      <MenuItem
        onClick={() => {
          if (isAuthenticated) setOpen(true)
          else openLoginDialog()
        }}
      >
        <ListItemIcon>
          <CarbonCloud />
        </ListItemIcon>
        <ListItemText
          primary={m.ratingCalculator_io_import_lxns_title({}, { locale })}
          secondary={
            isAuthenticated ? (
              <span className="flex gap-1">
                <ImportRegionSupportTag region="cn" />
              </span>
            ) : (
              m.ratingCalculator_io_import_lxns_loginRequired({}, { locale })
            )
          }
        />
      </MenuItem>

      {/* The dialog is portalled, but its React events still bubble to the open import Menu, which closes on Tab
          and would unmount the form mid-sign-in */}
      {!isAuthenticated && (
        <span className="contents" onKeyDown={(event) => event.stopPropagation()}>
          <LoginDialog />
        </span>
      )}
      {open && (
        <Dialog open={open} onClose={handleClose}>
          <LxnsImportDialogContent onClose={handleClose} />
        </Dialog>
      )}
    </>
  )
}