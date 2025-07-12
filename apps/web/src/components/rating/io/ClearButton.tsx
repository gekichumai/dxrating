import { Alert, AlertTitle, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grow } from '@mui/material'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import type { PlayEntry } from '../RatingCalculatorAddEntryForm'

export const ClearButton: FC<{
  modifyEntries: ListActions<PlayEntry>
}> = ({ modifyEntries }) => {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { t } = useTranslation(['rating-calculator'])

  return (
    <>
      <Dialog TransitionComponent={Grow} open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>{t('rating-calculator:io.clear.dialog.title')}</DialogTitle>
        <DialogContent className="min-w-[20rem]">
          <Alert severity="warning">
            <AlertTitle>{t('rating-calculator:io.clear.dialog.warning')}</AlertTitle>
            {t('rating-calculator:io.clear.dialog.message')}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('rating-calculator:io.clear.dialog.cancel')}</Button>

          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDialogOpen(false)
              modifyEntries.clear()
            }}
          >
            {t('rating-calculator:io.clear.dialog.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <Button
        color="error"
        variant="outlined"
        onClick={() => {
          setDialogOpen(true)
        }}
      >
        {t('rating-calculator:io.clear.button')}
      </Button>
    </>
  )
}
