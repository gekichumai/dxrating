import MdiBeta from '~icons/mdi/beta'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

export const BetaBadge = ({ className }: { className?: string }) => {
  const { t } = useTranslation(['global'])

  return (
    <div
      className={clsx(
        'bg-gray-200 rounded-full px-2 py-1 text-xs flex items-center gap-1 select-none leading-none',
        className,
      )}
    >
      <MdiBeta />
      <span>{t('global:beta')}</span>
    </div>
  )
}