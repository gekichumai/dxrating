import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { type FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useScoreEntries, useScoreRepository } from '@/models/scores/useScoreRepository'

export const ClearButton: FC = () => {
  const repository = useScoreRepository()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { t } = useTranslation(['rating-calculator'])
  const entries = useScoreEntries()

  return (
    <>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>{t('rating-calculator:io.clear.dialog.title')}</DialogTitle>
        <DialogContent className="min-w-[20rem]">
          <Alert severity="warning">{t('rating-calculator:io.clear.dialog.message', { count: entries.length })}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('rating-calculator:io.clear.dialog.cancel')}</Button>

          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setDialogOpen(false)
              captureAnalyticsEvent('rating_calculator_cleared', {
                entry_count: entries.length,
              })
              repository.clear()
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