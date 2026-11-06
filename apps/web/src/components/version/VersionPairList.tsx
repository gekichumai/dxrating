import type { VersionEnum } from '@gekichumai/dxdata'
import clsx from 'clsx'
import { type FC, type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react'
import { segmentedItem, segmentedTrack } from '@/components/completion/TableChrome'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'
import { VERSION_ERAS, type VersionEra, type VersionPair } from './versionEras'

const ERA_LABELS = { dx: m.versions_era_dx, classic: m.versions_era_classic } satisfies Record<VersionEra, PlainMessage>
const ERA_RANGES = {
  dx: m.versions_era_dxRange,
  classic: m.versions_era_classicRange,
} satisfies Record<VersionEra, PlainMessage>

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
  const locale = useLocale()
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
            <span>{ERA_LABELS[value]({}, { locale })}</span>
            <span className={clsx('text-xs num', era === value ? 'opacity-85' : 'text-fg-2')}>
              {badges?.[value] ?? ERA_RANGES[value]({}, { locale })}
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
  /** The rows are layout only, inside a list of their own (a listbox of options) */
  presentational?: boolean
  className?: string
}> = ({ pairs, renderVersion, presentational, className }) => (
  <ul role={presentational ? 'none' : undefined} className={clsx('m-0 p-0 list-none grid gap-2', className)}>
    {pairs.map((pair) => (
      <li key={pair.key} role={presentational ? 'none' : undefined} className="grid grid-cols-2 gap-1.5">
        {pair.base ? renderVersion(pair.base) : <span aria-hidden />}
        {pair.plus ? renderVersion(pair.plus) : <span aria-hidden />}
      </li>
    ))}
  </ul>
)
/**
 * Both eras on the page at once, でらっくす first, each under its own heading: nothing is hidden behind a switch, so
 * every version is visible and in the server HTML. `jumpNav` adds in-page anchor links to the two sections.
 */
export const VersionEraSections: FC<{
  /** Prefix for the section anchors, e.g. `era` gives `#era-dx` and `#era-classic` */
  idPrefix: string
  headingLevel?: 'h2' | 'h3'
  jumpNav?: boolean
  className?: string
  children: (era: VersionEra) => ReactNode
}> = ({ idPrefix, headingLevel: Heading = 'h2', jumpNav, className, children }) => {
  const locale = useLocale()

  return (
    <div className={clsx('flex flex-col gap-5', className)}>
      {jumpNav && (
        <nav aria-label={m.versions_era_label({}, { locale })} className={`${segmentedTrack} self-start`}>
          {VERSION_ERAS.map((era) => (
            <a key={era} href={`#${idPrefix}-${era}`} className={clsx(segmentedItem(false), 'gap-1.5')}>
              <span>{ERA_LABELS[era]({}, { locale })}</span>
              <span className="text-xs num text-fg-2">{ERA_RANGES[era]({}, { locale })}</span>
            </a>
          ))}
        </nav>
      )}
      {VERSION_ERAS.map((era) => (
        <section
          key={era}
          id={`${idPrefix}-${era}`}
          aria-labelledby={`${idPrefix}-${era}-heading`}
          className="flex flex-col gap-2 scroll-mt-2"
        >
          <Heading id={`${idPrefix}-${era}-heading`} className="m-0 flex items-baseline gap-2 section-title">
            <span>{ERA_LABELS[era]({}, { locale })}</span>
            <span className="text-sm font-normal text-fg-2 num">{ERA_RANGES[era]({}, { locale })}</span>
          </Heading>
          {children(era)}
        </section>
      ))}
    </div>
  )
}