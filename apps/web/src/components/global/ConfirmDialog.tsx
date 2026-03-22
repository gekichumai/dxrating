import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { type FC, type ReactNode, useCallback, useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
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
  confirmColor = 'error',
  onConfirm,
  onCancel,
}) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
    <DialogTitle>{title}</DialogTitle>
    {description && (
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
    )}
    <DialogActions>
      <Button onClick={onCancel}>{cancelLabel}</Button>
      <Button onClick={onConfirm} color={confirmColor} variant="contained">
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
)

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