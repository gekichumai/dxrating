import type { SaveDTO } from '@gekichumai/api-contract'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import { type FC, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadError } from './LoadError'
import { SaveOptionList } from './SaveSelector'
import './cloud-save.css'

/**
 * "Use a cloud save": on a browser with no local records and no cloud save chosen, lists the account's cloud saves
 * (`GET /saves`, only once opened) and makes the one chosen active. Nothing is uploaded and nothing is migrated; with
 * no saves it says so and offers nothing else.
 */

export interface ChooseCloudSaveDialogProps {
  open: boolean
  onClose(): void
  /** `GET /saves` (`ActiveSave.listSaves`) */
  listSaves(): Promise<readonly SaveDTO[]>
  /** Makes the save active (`ActiveSave.setActiveSaveId`); the dialog closes itself through `onClose` after it */
  onChoose(saveId: string): void
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; saves: readonly SaveDTO[] }

export const ChooseCloudSaveDialog: FC<ChooseCloudSaveDialogProps> = ({ open, onClose, listSaves, onChoose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const titleId = useId()
  const descriptionId = useId()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  // Bumped by "Try again" after a failed load
  const [attempt, setAttempt] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState({ kind: 'loading' })
    listSaves().then(
      (saves) => !cancelled && setState({ kind: 'loaded', saves }),
      () => !cancelled && setState({ kind: 'error' }),
    )
    return () => {
      cancelled = true
    }
  }, [open, attempt, listSaves])

  // The heading takes the focus once the list (or what replaces it) is in: the loading indicator it replaced is gone
  useEffect(() => {
    if (state.kind !== 'loading') headingRef.current?.focus()
  }, [state.kind])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id={titleId} ref={headingRef} tabIndex={-1} className="outline-none">
        {t('rating-calculator:cloud-save.choose.dialog-title')}
      </DialogTitle>
      <DialogContent className="flex flex-col gap-3">
        <DialogContentText id={descriptionId} className="text-sm text-pretty">
          {t('rating-calculator:cloud-save.choose.dialog-description')}
        </DialogContentText>
        {state.kind === 'loading' ? (
          <output className="flex items-center gap-2 py-2 text-sm text-zinc-500">
            <CircularProgress size="1rem" aria-hidden />
            {t('rating-calculator:cloud-save.saves.loading')}
          </output>
        ) : state.kind === 'error' ? (
          <LoadError
            message={t('rating-calculator:cloud-save.saves.error')}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        ) : state.saves.length === 0 ? (
          <p className="m-0 text-sm text-zinc-600 text-pretty">{t('rating-calculator:cloud-save.choose.empty')}</p>
        ) : (
          <SaveOptionList
            saves={state.saves}
            activeId={null}
            onChoose={(saveId) => {
              onChoose(saveId)
              onClose()
            }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('rating-calculator:cloud-save.choose.cancel')}</Button>
      </DialogActions>
    </Dialog>
  )
}