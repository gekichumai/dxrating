import { CircularProgress, Tooltip } from '@mui/material'
import { Link, useLocation, useRouterState } from '@tanstack/react-router'
import clsx from 'clsx'
import { type FC, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import MdiTrendingUpIcon from '~icons/mdi/trending-up'
import MdiUpdateIcon from '~icons/mdi/update'
import {
  APP_TAB_LINKS,
  CHART_DISCOVERY_NAV_LINKS,
  getActiveAppTabValue,
  getPendingAppTabValue,
} from '@/routes/-top-nav-links'
import { captureAnalyticsEvent } from '@/lib/analytics'

interface AppTabContentProps {
  children: ReactNode
  fixedSize?: boolean
  pending: boolean
}

const AppTabContent: FC<AppTabContentProps> = ({ children, fixedSize = false, pending }) => (
  <span className={clsx('relative inline-flex items-center justify-center', fixedSize && 'h-5 w-5')}>
    <span
      aria-hidden={pending ? true : undefined}
      className={clsx('inline-flex items-center justify-center', fixedSize && 'h-5 w-5')}
      style={pending ? { visibility: 'hidden' } : undefined}
    >
      {children}
    </span>
    {pending && (
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <CircularProgress className="!h-5 !w-5" color="inherit" disableShrink size="1.25rem" />
      </span>
    )}
  </span>
)

/**
 * The primary navigation: a segmented control of plain links. Each is in the tab order and the current page carries
 * aria-current, unlike ARIA tabs, which imply an in-page tab panel and hide all but the selected link from Tab.
 * The container is 12px glass with a 3px padding and a 1px border around 8px links (8 + 3 + 1 = 12).
 */
export const AppTabs: FC = () => {
  const { t } = useTranslation(['root'])
  const location = useLocation()

  const activeTab = getActiveAppTabValue(location.pathname)
  const pendingTab = useRouterState({
    select: (state) =>
      getPendingAppTabValue(state.isLoading, state.location.pathname, state.resolvedLocation?.pathname),
  })
  const selectedTab = pendingTab || activeTab

  return (
    <nav aria-label={t('root:primary-navigation')} className="app-nav glass-thin flex items-center p-[3px]">
      <ul className="flex items-center gap-0.5 list-none m-0 p-0">
        {APP_TAB_LINKS.map((link) => {
          const label = t(link.labelKey)
          const isSelected = selectedTab === link.value
          const isPendingTab = pendingTab === link.value
          const isIconOnlyTab = CHART_DISCOVERY_NAV_LINKS.some((chartLink) => chartLink.value === link.value)
          const Icon =
            link.value === 'recent' ? MdiUpdateIcon : link.value === 'trending' ? MdiTrendingUpIcon : undefined

          const anchor = (
            <Link
              to={link.href}
              aria-current={activeTab === link.value ? 'page' : undefined}
              aria-busy={isPendingTab ? true : undefined}
              aria-label={isIconOnlyTab || isPendingTab ? label : undefined}
              data-selected={isSelected ? '' : undefined}
              onClick={() => {
                captureAnalyticsEvent('tab_switched', {
                  tab: link.value,
                  source: 'top_navigation',
                })
              }}
              viewTransition
              className={clsx(
                'flex h-10 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold leading-none whitespace-nowrap no-underline select-none',
                '[transition-property:background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-out)] [-webkit-tap-highlight-color:transparent]',
                isIconOnlyTab ? 'w-10' : 'px-4',
                isSelected ? 'bg-accent-strong text-on-accent' : 'text-fg-2 hover:bg-white/55 hover:text-fg-1',
              )}
            >
              {isIconOnlyTab && Icon ? (
                <AppTabContent fixedSize pending={isPendingTab}>
                  <Icon aria-hidden className="block text-lg" />
                </AppTabContent>
              ) : (
                <AppTabContent pending={isPendingTab}>{label}</AppTabContent>
              )}
            </Link>
          )

          return (
            <li key={link.value} className="flex">
              {isIconOnlyTab ? <Tooltip title={label}>{anchor}</Tooltip> : anchor}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}