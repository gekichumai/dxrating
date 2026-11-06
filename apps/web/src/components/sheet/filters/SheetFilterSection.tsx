import { useId, type FC, type ReactNode } from 'react'
import { IconButton } from '@mui/material'
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
        <h3 id={titleId} className="m-0 text-lg font-semibold flex items-center">
          {titleLeft}
        </h3>
        {/* Resetting one section is not destructive: a quiet icon button, named "Reset <section>" */}
        <IconButton
          type="button"
          size="small"
          className="shrink-0 !text-fg-2"
          aria-labelledby={`${resetId} ${titleId}`}
          title={t('sheet:sort-and-filter.reset.section')}
          onClick={reset}
        >
          <MdiRestore aria-hidden="true" />
          <span id={resetId} className="sr-only">
            {t('sheet:sort-and-filter.reset.section')}
          </span>
        </IconButton>
        <div className="flex-1" />
        {titleRight}
      </div>
      <div className="w-full flex flex-col items-start md:flex-row gap-2">{children}</div>
    </div>
  )
}