import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { type FC, type ReactNode, useCallback, useId, useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
  /** `error` only for actions that lose data or access; reversible ones such as signing out stay `primary` */
  confirmColor?: 'error' | 'primary' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmColor = 'primary',
  onConfirm,
  onCancel,
}) => {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <DialogTitle id={titleId} className="!text-lg !font-semibold !leading-snug !text-fg-1 !pb-2">
        {title}
      </DialogTitle>
      {description && (
        <DialogContent>
          <DialogContentText id={descriptionId} className="!text-sm !text-fg-2 text-pretty">
            {description}
          </DialogContentText>
        </DialogContent>
      )}
      <DialogActions className="!px-4 !pb-4 !gap-1">
        <Button onClick={onCancel} color="inherit">
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} color={confirmColor} variant="contained">
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean
    resolve: ((confirmed: boolean) => void) | null
  }>({ open: false, resolve: null })

  const confirm = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    state.resolve?.(true)
    setState({ open: false, resolve: null })
  }, [state.resolve])

  const handleCancel = useCallback(() => {
    state.resolve?.(false)
    setState({ open: false, resolve: null })
  }, [state.resolve])

  return { open: state.open, confirm, onConfirm: handleConfirm, onCancel: handleCancel }
}