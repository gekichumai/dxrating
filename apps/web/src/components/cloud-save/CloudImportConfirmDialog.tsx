import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { type FC, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { cloudImportConfirm } from './cloudImportConfirm'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'

/**
 * Answers `cloudImportConfirm.request()`: a file import into a cloud save merges, or, after a second explicit
 * confirmation, clears the save first (§5.3 rule 5). Renders nothing until a cloud import asks.
 */
export const CloudImportConfirmDialog: FC = () => {
  const locale = useLocale()
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
          <DialogTitle
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="outline-none !text-lg !font-semibold !leading-snug !text-fg-1 !pb-2"
          >
            {m.ratingCalculator_cloudSave_importConfirm_title({ count: request.count }, { locale })}
          </DialogTitle>
          <DialogContent>
            <DialogContentText className="!text-sm !text-fg-2 text-pretty">
              {m.ratingCalculator_cloudSave_importConfirm_description({}, { locale })}
            </DialogContentText>
            {request.leftOut > 0 && (
              <Alert severity="info" className="mt-3 text-pretty">
                {m.ratingCalculator_cloudSave_importConfirm_leftOut({ count: request.leftOut }, { locale })}
              </Alert>
            )}
          </DialogContent>
          <DialogActions className="flex-wrap !px-4 !pb-4 !gap-1">
            {/* The destructive path away from the primary action */}
            <Button color="error" onClick={() => goTo('confirm-clear')}>
              {m.ratingCalculator_cloudSave_importConfirm_clearFirst({}, { locale })}
            </Button>
            <div className="flex-1" />
            <Button onClick={cancel} color="inherit">
              {m.ratingCalculator_cloudSave_importConfirm_cancel({}, { locale })}
            </Button>
            <Button variant="contained" onClick={() => request.resolve('merge')}>
              {m.ratingCalculator_cloudSave_importConfirm_merge({}, { locale })}
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="outline-none !text-lg !font-semibold !leading-snug !text-fg-1 !pb-2"
          >
            {m.ratingCalculator_cloudSave_importConfirm_clearTitle({}, { locale })}
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" className="text-pretty">
              {m.ratingCalculator_cloudSave_importConfirm_clearDescription({}, { locale })}
            </Alert>
          </DialogContent>
          <DialogActions className="!px-4 !pb-4 !gap-1">
            <Button onClick={() => goTo('choose')} color="inherit">
              {m.ratingCalculator_cloudSave_importConfirm_back({}, { locale })}
            </Button>
            <Button color="error" variant="contained" onClick={() => request.resolve('replace')}>
              {m.ratingCalculator_cloudSave_importConfirm_clearConfirm({}, { locale })}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}