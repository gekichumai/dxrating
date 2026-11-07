import MdiBeta from '~icons/mdi/beta'
import clsx from 'clsx'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const BetaBadge = ({ className }: { className?: string }) => {
  const locale = useLocale()

  return (
    <div
      className={clsx(
        'glass-inset !rounded-full px-2 py-1 text-xs font-semibold text-fg-1 flex items-center gap-1 select-none leading-none',
        className,
      )}
    >
      <MdiBeta aria-hidden />
      <span>{m.global_beta({}, { locale })}</span>
    </div>
  )
}