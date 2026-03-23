import { ImportRegionSupportTag } from '@/components/rating/io/import/ImportRegionSupportTag'
import { DifficultyEnum } from '@gekichumai/dxdata'
import type { TypeEnum } from '@gekichumai/dxdata'
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
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import CarbonCloud from '~icons/carbon/cloud'
import * as Sentry from '@sentry/react'
import { canonicalIdFromParts, useSheets } from '../../../../songs'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { useAuth } from '../../../../hooks/useAuth'
import { apiClient } from '../../../../lib/orpc'
import { WebHaptics } from 'web-haptics'
import type { ComboFlag, PlayEntry, SyncFlag } from '../../RatingCalculatorAddEntryForm'

const haptics = new WebHaptics()

const difficultyMap: Record<number, DifficultyEnum> = {
  0: DifficultyEnum.Basic,
  1: DifficultyEnum.Advanced,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
}

type ConnectionState = 'loading' | 'not-connected' | 'connected' | 'connecting' | 'importing' | 'error'

const LxnsImportDialogContent: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const { data: sheets } = useSheets({ acceptsPartialData: true })
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
      toast.error(t('rating-calculator:io.import.lxns.error', { error: formatErrorMessage(error) }))
      setState('not-connected')
    }
  }

  const handleImport = async () => {
    setState('importing')
    const importStart = performance.now()
    try {
      const result = await apiClient.lxns.start()

      const entries: PlayEntry[] = result.scores
        .filter((s) => s.type !== 'utage')
        .map((score) => ({
          sheetId: canonicalIdFromParts(
            score.songName,
            (score.type === 'standard' ? 'std' : score.type) as TypeEnum,
            difficultyMap[score.levelIndex],
          ),
          achievementRate: score.achievements,
          comboFlag: (score.fc || null) as ComboFlag,
          syncFlag: (score.fs || null) as SyncFlag,
        }))
        .filter((entry) => {
          const found = sheets?.find((sheet) => sheet.id === entry.sheetId)
          if (!found) {
            console.warn(`No sheet found for ${entry.sheetId}`)
          }
          return found
        })

      modifyEntries.set(entries)
      haptics.trigger('success')
      toast.success(t('rating-calculator:io.import.lxns.success', { count: entries.length }))

      Sentry.metrics.distribution('lxns_import.duration', performance.now() - importStart, {
        unit: 'millisecond',
      })
      Sentry.metrics.distribution('lxns_import.entries', entries.length, { unit: 'none' })
      onClose()
    } catch (error) {
      Sentry.metrics.count('lxns_import.failure', 1)
      const msg = String(formatErrorMessage(error))
      if (msg.includes('expired') || msg.includes('reconnect') || msg.includes('authorize')) {
        toast.error(t('rating-calculator:io.import.lxns.reconnect-required'))
        setState('not-connected')
      } else {
        toast.error(t('rating-calculator:io.import.lxns.error', { error: msg }))
        setState('connected')
      }
    }
  }

  const handleDisconnect = async () => {
    try {
      await apiClient.lxns.disconnect()
      toast.success(t('rating-calculator:io.import.lxns.disconnected'))
      setState('not-connected')
    } catch (error) {
      toast.error(t('rating-calculator:io.import.lxns.error', { error: formatErrorMessage(error) }))
    }
  }

  return (
    <>
      <DialogTitle>{t('rating-calculator:io.import.lxns.title')}</DialogTitle>
      <DialogContent className="flex flex-col items-start gap-3">
        {state === 'loading' && (
          <div className="w-full flex justify-center py-4">
            <CircularProgress size="1.5rem" />
          </div>
        )}

        {state === 'not-connected' && (
          <>
            <p className="text-sm text-zinc-500">{t('rating-calculator:io.import.lxns.description')}</p>
          </>
        )}

        {state === 'connected' && (
          <p className="text-sm text-green-700">{t('rating-calculator:io.import.lxns.connected')}</p>
        )}

        {state === 'connecting' && (
          <div className="w-full flex justify-center items-center gap-2 py-4">
            <CircularProgress size="1rem" />
            <span className="text-sm text-zinc-500">{t('rating-calculator:io.import.lxns.connecting')}</span>
          </div>
        )}

        {state === 'importing' && (
          <div className="w-full flex justify-center items-center gap-2 py-4">
            <CircularProgress size="1rem" />
            <span className="text-sm text-zinc-500">{t('rating-calculator:io.import.lxns.importing')}</span>
          </div>
        )}
      </DialogContent>

      <DialogActions>
        {state === 'connected' && (
          <Button onClick={handleDisconnect} color="inherit" size="small">
            {t('rating-calculator:io.import.lxns.disconnect')}
          </Button>
        )}

        <div className="flex-1" />

        <Button onClick={onClose}>{t('rating-calculator:io.import.lxns.close')}</Button>

        {state === 'not-connected' && (
          <Button onClick={handleConnect} variant="contained">
            {t('rating-calculator:io.import.lxns.connect')}
          </Button>
        )}

        {state === 'connected' && (
          <Button onClick={handleImport} variant="contained">
            {t('rating-calculator:io.import.lxns.import')}
          </Button>
        )}
      </DialogActions>
    </>
  )
}

export const ImportFromLxnsButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const { isAuthenticated } = useAuth()
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    setOpen(false)
    onClose()
  }

  return (
    <>
      <MenuItem
        disabled={!isAuthenticated}
        onClick={() => {
          setOpen(true)
        }}
      >
        <ListItemIcon>
          <CarbonCloud />
        </ListItemIcon>
        <ListItemText
          primary={t('rating-calculator:io.import.lxns.title')}
          secondary={
            isAuthenticated ? (
              <div className="flex gap-1">
                <ImportRegionSupportTag region="cn" />
              </div>
            ) : (
              t('rating-calculator:io.import.lxns.login-required')
            )
          }
        />
      </MenuItem>

      {open && (
        <Dialog open={open} onClose={handleClose}>
          <LxnsImportDialogContent modifyEntries={modifyEntries} onClose={handleClose} />
        </Dialog>
      )}
    </>
  )
}