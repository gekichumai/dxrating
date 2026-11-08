import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { type FC, useEffect, useId, useMemo, useSyncExternalStore } from 'react'
import { exportSavePicker } from './exportSavePicker'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'
import './cloud-save.css'

const REGION_LABELS: Record<string, string> = {
  jp: 'JP',
  intl: 'Intl',
  cn: 'CN',
}

/** Answers `exportSavePicker.request()`: which save of a "Download my data" file to import */
export const ExportSavePickerDialog: FC = () => {
  const locale = useLocale()
  const request = useSyncExternalStore(
    exportSavePicker.subscribe,
    exportSavePicker.getSnapshot,
    exportSavePicker.getServerSnapshot,
  )
  const titleId = useId()
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale])
  useEffect(() => exportSavePicker.registerHost(), [])
  if (!request) return null
  const cancel = () => request.resolve(null)

  return (
    <Dialog
      open
      onClose={cancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      PaperProps={{
        className: 'cloud-save-surface',
        sx: { borderRadius: '0.75rem' },
      }}
    >
      <DialogTitle id={titleId}>{m.ratingCalculator_cloudSave_exportImport_pickTitle({}, { locale })}</DialogTitle>
      <DialogContent className="flex flex-col gap-3">
        <DialogContentText className="text-pretty">
          {m.ratingCalculator_cloudSave_exportImport_pickDescription({}, { locale })}
        </DialogContentText>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {request.saves.map((save) => (
            <li key={save.id}>
              <button
                type="button"
                className="cloud-save-save-option flex w-full cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border-none bg-transparent px-3 py-2 text-left"
                onClick={() => request.resolve(save)}
              >
                {/* Wraps instead of clipping: names can be long, and two can share a prefix */}
                <span className="min-w-0 flex-1 break-words text-pretty text-sm font-semibold text-fg-1">
                  {save.name}
                </span>
                {REGION_LABELS[save.region] && (
                  <span className="mt-0.5 shrink-0 rounded-[var(--radius-xs)] bg-black/8 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-fg-2">
                    {REGION_LABELS[save.region]}
                  </span>
                )}
                <span className="mt-0.5 shrink-0 text-xs text-fg-2 tabular-nums">
                  {m.ratingCalculator_cloudSave_saves_records(
                    {
                      count: save.entries.length,
                      formatted: numberFormat.format(save.entries.length),
                    },
                    { locale },
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>{m.ratingCalculator_cloudSave_importConfirm_cancel({}, { locale })}</Button>
      </DialogActions>
    </Dialog>
  )
}