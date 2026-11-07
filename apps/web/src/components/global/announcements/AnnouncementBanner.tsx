import type { PublicAnnouncement } from '@gekichumai/api-contract'
import { IconButton } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ComponentType, type SVGProps } from 'react'
import IconMdiAlertOctagonOutline from '~icons/mdi/alert-octagon-outline'
import IconMdiAlertOutline from '~icons/mdi/alert-outline'
import IconMdiArrowRight from '~icons/mdi/arrow-right'
import IconMdiClose from '~icons/mdi/close'
import IconMdiInformationOutline from '~icons/mdi/information-outline'
import IconMdiOpenInNew from '~icons/mdi/open-in-new'
import { useLocale } from '@/i18n/LocaleProvider'
import { detectAnalyticsPlatform } from '@/lib/analytics'
import { orpc } from '@/lib/orpc'
import { useAppContext } from '@/models/context/useAppContext'
import { m } from '@/paraglide/messages'
import type { SupportedLocale } from '@/setup/locale'
import {
  isSiteLink,
  localizeAnnouncement,
  readDismissed,
  visibleAnnouncements,
  writeDismissed,
  type DismissedAnnouncements,
} from './announcements'

const SEVERITY_STYLE: Record<
  PublicAnnouncement['severity'],
  { Icon: ComponentType<SVGProps<SVGSVGElement>>; iconClass: string; edgeClass: string }
> = {
  info: { Icon: IconMdiInformationOutline, iconClass: 'text-accent', edgeClass: 'before:bg-accent' },
  warning: { Icon: IconMdiAlertOutline, iconClass: 'text-status-warning', edgeClass: 'before:bg-status-warning' },
  critical: { Icon: IconMdiAlertOctagonOutline, iconClass: 'text-danger', edgeClass: 'before:bg-danger' },
}

const severityLabel = (severity: PublicAnnouncement['severity'], locale: SupportedLocale) =>
  ({
    info: m.announcement_severity_info,
    warning: m.announcement_severity_warning,
    critical: m.announcement_severity_critical,
  })[severity]({}, { locale: locale })

/** How often an open page checks for new announcements while it is visible */
export const ANNOUNCEMENTS_REFETCH_INTERVAL_MS = 3 * 60_000

/** Re-renders each minute, so a scheduled announcement appears and an ended one leaves without a refetch */
function useMinuteClock(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}

/**
 * Global announcements (gekichumai/meta#49). They render only after hydration: the HTML of a page is the same for
 * every visitor and cached at the edge for up to 30 minutes (setup/html-cache.ts), which must not pin an announcement
 * past its end. Each one is a floating card in the bottom notice stack, so nothing in the page moves when it appears.
 * The iOS app shows its own, so they stay out of its web views.
 */
export function AnnouncementBanners() {
  const locale = useLocale()
  const { region, hydrated } = useAppContext()
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState<DismissedAnnouncements>({})
  useEffect(() => {
    setMounted(true)
    setDismissed(readDismissed(safeLocalStorage()))
  }, [])
  const inNativeShell = mounted && detectAnalyticsPlatform(window.location.href) === 'ios'
  const enabled = mounted && hydrated && !inNativeShell

  const { data } = useQuery({
    ...orpc.announcements.list.queryOptions(),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // A tab that stays open also picks up a new, edited or ended announcement (the edge refreshes its copy each
    // minute, so polling faster gains nothing)
    refetchInterval: ANNOUNCEMENTS_REFETCH_INTERVAL_MS,
    retry: 1,
  })
  const now = useMinuteClock(enabled)
  const visible =
    enabled && data ? visibleAnnouncements(data.announcements, { platform: 'web', region, now, dismissed }) : []
  const politeText = usePoliteAnnouncement(visible, locale, data?.locales.fallbacks)
  if (!mounted) return null

  const dismiss = (announcement: PublicAnnouncement) =>
    setDismissed((current) =>
      writeDismissed(
        safeLocalStorage(),
        { ...current, [announcement.id]: announcement.revision },
        data?.announcements ?? [],
      ),
    )

  return (
    <>
      {/* Mounted empty before any notice arrives: screen readers announce a change to a live region that already
          exists, not one inserted with its text (critical cards are role=alert, which is announced on insertion) */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {politeText}
      </div>
      {data &&
        visible.map((announcement) => (
          <AnnouncementCard
            key={`${announcement.id}:${announcement.revision}`}
            announcement={announcement}
            locale={locale}
            fallbacks={data.locales.fallbacks}
            onDismiss={() => dismiss(announcement)}
          />
        ))}
    </>
  )
}

/** The text of the info and warning notices that newly appeared (or were revised), for the polite live region */
function usePoliteAnnouncement(
  visible: readonly PublicAnnouncement[],
  locale: SupportedLocale,
  fallbacks: Record<string, string[]> | undefined,
) {
  const [text, setText] = useState('')
  const announced = useRef(new Set<string>())
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Texts waiting for the delayed write, so a second update before it runs adds to them instead of replacing them */
  const queued = useRef<string[]>([])
  useEffect(() => () => clearTimeout(pending.current), [])
  // The set of announced revisions keeps a re-render or a language switch from repeating a notice
  useEffect(() => {
    const fresh = visible.filter(
      (announcement) =>
        announcement.severity !== 'critical' && !announced.current.has(`${announcement.id}:${announcement.revision}`),
    )
    if (fresh.length === 0) return
    for (const announcement of fresh) announced.current.add(`${announcement.id}:${announcement.revision}`)
    const texts = fresh
      .map((announcement) => {
        const { title, body } = localizeAnnouncement(announcement, locale, fallbacks)
        return title
          ? [`${severityLabel(announcement.severity, locale)}: ${title.value}`, body?.value].filter(Boolean).join('. ')
          : null
      })
      .filter((value): value is string => Boolean(value))
    // Empty the region first, so a revision whose text reads the same is still a change screen readers announce
    setText('')
    clearTimeout(pending.current)
    queued.current.push(...texts)
    pending.current = setTimeout(() => {
      setText(queued.current.join('. '))
      queued.current = []
    }, 150)
  }, [visible, locale, fallbacks])
  return text
}

function AnnouncementCard({
  announcement,
  locale,
  fallbacks,
  onDismiss,
}: {
  announcement: PublicAnnouncement
  locale: SupportedLocale
  fallbacks: Record<string, string[]>
  onDismiss: () => void
}) {
  const titleId = useId()
  const { title, body, linkLabel } = localizeAnnouncement(announcement, locale, fallbacks)
  if (!title || !body) return null
  const { Icon, iconClass, edgeClass } = SEVERITY_STYLE[announcement.severity]
  const label = severityLabel(announcement.severity, locale)
  const link = announcement.link
  const siteLink = link ? isSiteLink(link.url) : false

  return (
    <section
      aria-labelledby={titleId}
      role={announcement.severity === 'critical' ? 'alert' : undefined}
      data-severity={announcement.severity}
      className={`glass-overlay relative overflow-hidden p-4 pe-2 shadow-[var(--shadow-overlay)] before:absolute before:inset-y-0 before:start-0 before:w-1 before:content-[''] ${edgeClass}`}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h2 id={titleId} className="m-0 text-base font-semibold leading-snug text-fg-1 text-balance">
            <span className="sr-only">{label}: </span>
            <span lang={title.locale}>{title.value}</span>
          </h2>
          <p lang={body.locale} className="m-0 text-sm text-fg-2 text-pretty whitespace-pre-line break-words">
            {body.value}
          </p>
          {link ? (
            <a
              href={link.url}
              {...(siteLink ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-strong underline-offset-2 hover:underline focus-visible:underline"
            >
              <span lang={linkLabel?.locale}>
                {linkLabel?.value ?? m.announcement_learnMore({}, { locale: locale })}
              </span>
              {siteLink ? <IconMdiArrowRight aria-hidden="true" /> : <IconMdiOpenInNew aria-hidden="true" />}
            </a>
          ) : null}
        </div>
        {announcement.dismissible ? (
          <IconButton
            size="small"
            onClick={onDismiss}
            aria-label={m.announcement_dismiss({}, { locale: locale })}
            title={m.announcement_dismiss({}, { locale: locale })}
            className="!-mt-1 !shrink-0 !text-fg-2"
          >
            <IconMdiClose aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
    </section>
  )
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}