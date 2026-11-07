import clsx from 'clsx'
import { type FC, useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import type { SupportedLocale } from '@/setup/locale'
import { aliasQuestion } from './aliasQuestion'

/**
 * What clicking an alias copies. Chinese-speaking players share an alias as "<alias>是什么歌" ("what song is
 * <alias>?"), so zh-Hans and zh-Hant copy its 是什么歌 link (see aliasQuestion); other locales copy the alias itself.
 */
export function aliasCopyContent(altName: string, locale: SupportedLocale) {
  if (locale === 'zh-Hans' || locale === 'zh-Hant') return aliasQuestion(altName)
  const alias = altName.trim()
  return { clipboard: alias, toastContent: alias }
}

const COLLAPSED_MASK = 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 5rem, rgba(0,0,0,0) 100%)'

export const SheetAltNames: FC<{ altNames: string[] }> = ({ altNames }) => {
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  // Measured after mount, so the first render is the same on the server and the client
  const [overflowing, setOverflowing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    // Overflow is measured against the collapsed height only. Expanded, the list fits its own box, so measuring
    // then would clear the flag and unmount the focused "Show fewer" button; keep the collapsed reading instead.
    if (expanded) return
    const element = listRef.current
    if (!element) return
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [altNames, expanded])

  const collapsed = !expanded && overflowing

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        ref={listRef}
        id={listId}
        className={clsx('text-sm text-fg-2 overflow-hidden', !expanded && 'max-h-[7rem]')}
        style={{ mask: collapsed ? COLLAPSED_MASK : undefined, WebkitMask: collapsed ? COLLAPSED_MASK : undefined }}
      >
        {altNames?.map((altName, i) => (
          <span className="inline-block whitespace-pre-line" key={altName}>
            <button
              type="button"
              // While the list is clipped, Tab skips the aliases (some are hidden); "Show all" reveals them first
              tabIndex={collapsed ? -1 : undefined}
              // Copies the alias, so it reads as a control: a dotted underline on hover and focus
              className="cursor-copy rounded-[var(--radius-xs)] border-0 bg-transparent p-0 text-inherit font-inherit text-left decoration-dotted underline-offset-2 hover:underline focus-visible:underline"
              title={m.sheet_aliases_copy({}, { locale })}
              onClick={() => {
                const { clipboard, toastContent } = aliasCopyContent(altName, locale)
                void navigator.clipboard?.writeText(clipboard)
                toast.success(m.sheet_copyAltName_toastSuccess({ content: toastContent }, { locale }), {
                  id: `copy-sheet-alt-name-${altName}`,
                })
              }}
            >
              {altName}
            </button>
            {i < altNames.length - 1 && (
              <span aria-hidden="true" className="mx-1 select-none text-fg-2">
                /
              </span>
            )}
          </span>
        ))}
      </div>

      {overflowing && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
          className="cursor-pointer rounded-[var(--radius-xs)] border-0 bg-transparent p-0 text-xs font-semibold text-accent-strong hover:underline"
        >
          {expanded
            ? m.sheet_aliases_showLess({}, { locale })
            : m.sheet_aliases_showAll({ count: altNames.length }, { locale })}
        </button>
      )}
    </div>
  )
}