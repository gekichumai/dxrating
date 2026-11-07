import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { type FC, useState } from 'react'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useScoreEntries, useScoreRepository } from '@/models/scores/useScoreRepository'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const ClearButton: FC = () => {
  const repository = useScoreRepository()
  const [dialogOpen, setDialogOpen] = useState(false)
  const locale = useLocale()
  const entries = useScoreEntries()

  return (
    <>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>{m.ratingCalculator_io_clear_dialog_title({}, { locale })}</DialogTitle>
        <DialogContent className="min-w-[20rem]">
          <Alert severity="warning">
            {m.ratingCalculator_io_clear_dialog_message({ count: entries.length }, { locale })}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {m.ratingCalculator_io_clear_dialog_cancel({}, { locale })}
          </Button>

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
            {m.ratingCalculator_io_clear_dialog_confirm({}, { locale })}
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
        {m.ratingCalculator_io_clear_button({}, { locale })}
      </Button>
    </>
  )
}