import { useId, type FC, type ReactNode } from 'react'
import { Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import MdiRestore from '~icons/mdi/restore'

export const SheetFilterSection: FC<{
  titleLeft: ReactNode
  titleRight?: ReactNode
  children: ReactNode
  reset: () => void
}> = ({ titleLeft, titleRight, children, reset }) => {
  const { t } = useTranslation(['sheet'])
  const titleId = useId()
  const resetId = useId()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 id={titleId} className="text-lg font-semibold flex items-center tracking-tight">
          {titleLeft}
        </h3>
        <Button
          type="button"
          sx={{ minWidth: 40, minHeight: 40, p: 1 }}
          className="shrink-0 text-xs inline-flex"
          color="error"
          variant="outlined"
          aria-labelledby={`${resetId} ${titleId}`}
          onClick={reset}
        >
          <MdiRestore aria-hidden="true" />
          <span id={resetId} className="sr-only">
            {t('sheet:sort-and-filter.reset.dialog.confirm')}
          </span>
        </Button>
        <div className="flex-1" />
        {titleRight}
      </div>
      <div className="w-full flex flex-col md:flex-row gap-2">{children}</div>
    </div>
  )
}