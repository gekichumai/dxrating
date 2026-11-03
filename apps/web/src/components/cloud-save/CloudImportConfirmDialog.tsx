import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { type FC, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { cloudImportConfirm } from './cloudImportConfirm'

/**
 * Answers `cloudImportConfirm.request()`: a file import into a cloud save merges, or, after a second explicit
 * confirmation, clears the save first (§5.3 rule 5). Renders nothing until a cloud import asks.
 */
export const CloudImportConfirmDialog: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const request = useSyncExternalStore(
    cloudImportConfirm.subscribe,
    cloudImportConfirm.getSnapshot,
    cloudImportConfirm.getServerSnapshot,
  )
  const [step, setStep] = useState<'choose' | 'confirm-clear'>('choose')
  const titleId = useId()

  // The heading of the step shown, focused when the step changes: the button that changed it is gone
  const headingRef = useRef<HTMLHeadingElement>(null)
  const stepChanged = useRef(false)

  useEffect(() => cloudImportConfirm.registerHost(), [])
  useEffect(() => setStep('choose'), [request])
  useEffect(() => {
    if (!stepChanged.current) return
    stepChanged.current = false
    headingRef.current?.focus()
  }, [step])

  const goTo = (next: typeof step) => {
    stepChanged.current = true
    setStep(next)
  }

  if (!request) return null
  const cancel = () => request.resolve(null)

  return (
    <Dialog open onClose={cancel} maxWidth="xs" fullWidth aria-labelledby={titleId}>
      {step === 'choose' ? (
        <>
          <DialogTitle id={titleId} ref={headingRef} tabIndex={-1} className="outline-none">
            {t('rating-calculator:cloud-save.import-confirm.title', { count: request.count })}
          </DialogTitle>
          <DialogContent>
            <DialogContentText className="text-pretty">
              {t('rating-calculator:cloud-save.import-confirm.description')}
            </DialogContentText>
          </DialogContent>
          <DialogActions className="flex-wrap gap-1">
            {/* The destructive path away from the primary action */}
            <Button color="error" onClick={() => goTo('confirm-clear')}>
              {t('rating-calculator:cloud-save.import-confirm.clear-first')}
            </Button>
            <div className="flex-1" />
            <Button onClick={cancel}>{t('rating-calculator:cloud-save.import-confirm.cancel')}</Button>
            <Button variant="contained" onClick={() => request.resolve('merge')}>
              {t('rating-calculator:cloud-save.import-confirm.merge')}
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle id={titleId} ref={headingRef} tabIndex={-1} className="outline-none">
            {t('rating-calculator:cloud-save.import-confirm.clear-title')}
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" className="text-pretty">
              {t('rating-calculator:cloud-save.import-confirm.clear-description')}
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => goTo('choose')}>{t('rating-calculator:cloud-save.import-confirm.back')}</Button>
            <Button color="error" variant="contained" onClick={() => request.resolve('replace')}>
              {t('rating-calculator:cloud-save.import-confirm.clear-confirm')}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}