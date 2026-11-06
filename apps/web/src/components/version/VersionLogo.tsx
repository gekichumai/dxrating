import type { VersionEnum } from '@gekichumai/dxdata'
import clsx from 'clsx'
import { type FC, useState } from 'react'
import { VERSION_LOGO_SIZE, versionLogoSrc } from './versionEras'

/**
 * A version's title logo, or its name set as text when there is none (classic cabinets) or it fails to load. The box
 * is the same either way, so a row of logos and names lines up. Size it with a height class; the width follows the
 * logo's aspect ratio.
 */
export const VersionLogo: FC<{
  version: VersionEnum
  /** The logo is decorative when the version's name is already written next to it */
  decorative?: boolean
  className?: string
}> = ({ version, decorative = false, className }) => {
  const src = versionLogoSrc(version)
  const [failed, setFailed] = useState(false)
  const box = clsx('aspect-[332/160] w-auto shrink-0 select-none', className)

  if (!src || failed) {
    return (
      <span
        aria-hidden={decorative || undefined}
        className={clsx(
          box,
          'inline-flex items-center justify-center rounded-[var(--radius-sm)] glass-inset px-1 text-center font-bold leading-tight text-fg-1',
        )}
      >
        <span className="[overflow-wrap:anywhere]" translate="no">
          {version}
        </span>
      </span>
    )
  }

  return (
    <img
      src={src}
      width={VERSION_LOGO_SIZE.width}
      height={VERSION_LOGO_SIZE.height}
      alt={decorative ? '' : version}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={clsx(box, 'object-contain touch-callout-none')}
    />
  )
}