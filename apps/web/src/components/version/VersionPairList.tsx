import type { VersionEnum } from '@gekichumai/dxdata'
import clsx from 'clsx'
import { type FC, type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { segmentedItem, segmentedTrack } from '@/components/completion/TableChrome'
import { VERSION_ERAS, type VersionEra, type VersionPair } from './versionEras'

/**
 * Two pages of versions, でらっくす and classic, behind a segmented tab control. Both pages are in the markup (the
 * hidden one with `hidden`), so every version link is in the server HTML and switching never fetches.
 */
export const VersionEraPager: FC<{
  label: string
  defaultEra?: VersionEra
  /** Extra text after a tab's name, such as how many of its versions are selected */
  badges?: Partial<Record<VersionEra, ReactNode>>
  className?: string
  children: (era: VersionEra) => ReactNode
}> = ({ label, defaultEra = 'dx', badges, className, children }) => {
  const { t } = useTranslation(['versions'])
  const [era, setEra] = useState<VersionEra>(defaultEra)
  const id = useId()
  const tabs = useRef<Partial<Record<VersionEra, HTMLButtonElement | null>>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = VERSION_ERAS[(VERSION_ERAS.indexOf(era) + step + VERSION_ERAS.length) % VERSION_ERAS.length]
    setEra(next)
    tabs.current[next]?.focus()
  }

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      <div role="tablist" aria-label={label} className={`${segmentedTrack} self-start`} onKeyDown={onKeyDown}>
        {VERSION_ERAS.map((value) => (
          <button
            key={value}
            ref={(element) => {
              tabs.current[value] = element
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${value}`}
            aria-controls={`${id}-panel-${value}`}
            aria-selected={era === value}
            tabIndex={era === value ? 0 : -1}
            onClick={() => setEra(value)}
            className={clsx(segmentedItem(era === value), 'border-0 cursor-pointer font-inherit gap-1.5')}
          >
            <span>{t(`versions:era.${value}`)}</span>
            <span className={clsx('text-xs num', era === value ? 'opacity-85' : 'text-fg-2')}>
              {badges?.[value] ?? t(`versions:era.${value}-range`)}
            </span>
          </button>
        ))}
      </div>
      {VERSION_ERAS.map((value) => (
        <div
          key={value}
          role="tabpanel"
          id={`${id}-panel-${value}`}
          aria-labelledby={`${id}-tab-${value}`}
          hidden={era !== value}
        >
          {children(value)}
        </div>
      ))}
    </div>
  )
}

/**
 * Versions in rows of two: the base version on the left and its PLUS on the right, with an empty cell where a version
 * has no PLUS. Pass a column count class (e.g. `lg:grid-cols-2`) to put several rows side by side on wide screens.
 */
export const VersionPairGrid: FC<{
  pairs: VersionPair[]
  renderVersion: (version: VersionEnum) => ReactNode
  className?: string
}> = ({ pairs, renderVersion, className }) => (
  <ul className={clsx('m-0 p-0 list-none grid gap-2', className)}>
    {pairs.map((pair) => (
      <li key={pair.key} className="grid grid-cols-2 gap-1.5">
        {pair.base ? renderVersion(pair.base) : <span aria-hidden />}
        {pair.plus ? renderVersion(pair.plus) : <span aria-hidden />}
      </li>
    ))}
  </ul>
)