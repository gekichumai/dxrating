import { useId, type FC, type ReactNode } from 'react'
import { IconButton } from '@mui/material'
import MdiRestore from '~icons/mdi/restore'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const SheetFilterSection: FC<{
  titleLeft: ReactNode
  titleRight?: ReactNode
  children: ReactNode
  reset: () => void
}> = ({ titleLeft, titleRight, children, reset }) => {
  const locale = useLocale()
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
          title={m.sheet_sortAndFilter_reset_section({}, { locale })}
          onClick={reset}
        >
          <MdiRestore aria-hidden="true" />
          <span id={resetId} className="sr-only">
            {m.sheet_sortAndFilter_reset_section({}, { locale })}
          </span>
        </IconButton>
        <div className="flex-1" />
        {titleRight}
      </div>
      <div className="w-full flex flex-col items-start md:flex-row gap-2">{children}</div>
    </div>
  )
}