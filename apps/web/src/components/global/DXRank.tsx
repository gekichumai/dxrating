import clsx from 'clsx'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContextSlugVersion } from '../../models/context/useAppContext'

export const DXRank: FC<{ rank?: string | null; className?: string }> = ({ rank, className }) => {
  const slugVersion = useAppContextSlugVersion()
  const { t } = useTranslation(['global'])

  if (!rank) {
    return <div className={clsx('aspect-w-128 aspect-h-60 bg-gray-200 rounded', className)} />
  }

  const image = `https://shama.dxrating.net/images/rank/${slugVersion}/${rank}.png`

  return (
    <img
      src={image}
      alt={t('global:dx-rank-alt', { rank })}
      className={clsx('aspect-w-128 aspect-h-60', className)}
      draggable={false}
    />
  )
}