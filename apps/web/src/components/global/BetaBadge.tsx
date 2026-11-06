import MdiBeta from '~icons/mdi/beta'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

export const BetaBadge = ({ className }: { className?: string }) => {
  const { t } = useTranslation(['global'])

  return (
    <div
      className={clsx(
        'glass-inset !rounded-full px-2 py-1 text-xs font-semibold text-fg-1 flex items-center gap-1 select-none leading-none',
        className,
      )}
    >
      <MdiBeta aria-hidden />
      <span>{t('global:beta')}</span>
    </div>
  )
}