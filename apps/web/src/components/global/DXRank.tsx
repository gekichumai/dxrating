import clsx from 'clsx'
import type { FC } from 'react'
import { useAppContextSlugVersion } from '../../models/context/useAppContext'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const DXRank: FC<{ rank?: string | null; className?: string }> = ({ rank, className }) => {
  const slugVersion = useAppContextSlugVersion()
  const locale = useLocale()

  if (!rank) {
    return <div className={clsx('aspect-w-128 aspect-h-60 bg-gray-200 rounded', className)} />
  }

  // MAGiCAL uses the existing rank artwork until its dedicated asset set is available.
  const rankVersion = slugVersion === 'magical' ? 'circle-plus' : slugVersion
  const image = `https://shama.dxrating.net/images/rank/${rankVersion}/${rank}.png`

  return (
    <img
      src={image}
      alt={m.global_dxRankAlt({ rank }, { locale })}
      className={clsx('aspect-w-128 aspect-h-60', className)}
      draggable={false}
    />
  )
}