import clsx from 'clsx'
import { FC } from 'react'
import { useAppContextSlugVersion } from '../../models/context/useAppContext'

export const DXRank: FC<{ rank?: string | null; className?: string }> = ({ rank, className }) => {
  const slugVersion = useAppContextSlugVersion()

  const image = `https://shama.dxrating.net/images/rank/${slugVersion}/${rank}.png`

  return image ? (
    <img src={image} className={clsx('aspect-w-128 aspect-h-60', className)} draggable={false} />
  ) : (
    <div className={clsx('aspect-w-128 aspect-h-60 bg-gray-200 rounded', className)} />
  )
}
