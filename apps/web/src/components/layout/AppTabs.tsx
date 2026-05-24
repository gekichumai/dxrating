import { CircularProgress, Tab, Tabs, Tooltip } from '@mui/material'
import { Link } from '@tanstack/react-router'
import type { FC, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import MdiTrendingUpIcon from '~icons/mdi/trending-up'
import MdiUpdateIcon from '~icons/mdi/update'
import { APP_TAB_LINKS, CHART_DISCOVERY_NAV_LINKS, type AppTabValue } from '@/routes/-top-nav-links'

interface AppTabsProps {
  activeTab: AppTabValue | false
  pendingTab?: AppTabValue | false
}

interface AppTabContentProps {
  children: ReactNode
  fixedSize?: boolean
  pending: boolean
}

const AppTabContent: FC<AppTabContentProps> = ({ children, fixedSize = false, pending }) => (
  <span className={`relative inline-flex items-center justify-center ${fixedSize ? 'h-5 w-5' : ''}`}>
    <span
      aria-hidden={pending ? true : undefined}
      className={`inline-flex items-center justify-center ${fixedSize ? 'h-5 w-5' : ''}`}
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

export const AppTabs: FC<AppTabsProps> = ({ activeTab, pendingTab = false }) => {
  const { t } = useTranslation(['root'])
  const selectedTab = pendingTab || activeTab

  return (
    <div className="rounded-xl bg-zinc-900/10 !min-h-2.5rem flex items-center overflow-hidden">
      <Tabs
        value={selectedTab}
        classes={{
          root: '!min-h-2.5rem',
          indicator: '!h-full !rounded-lg z-0',
        }}
      >
        {APP_TAB_LINKS.map((link) => {
          const label = t(link.labelKey)
          const isPendingTab = pendingTab === link.value
          const isIconOnlyTab = CHART_DISCOVERY_NAV_LINKS.some((chartLink) => chartLink.value === link.value)
          const Icon =
            link.value === 'recent' ? MdiUpdateIcon : link.value === 'trending' ? MdiTrendingUpIcon : undefined

          return (
            <Tab
              key={link.value}
              aria-busy={isPendingTab ? true : undefined}
              aria-label={isIconOnlyTab || isPendingTab ? label : undefined}
              component={Link}
              icon={
                isIconOnlyTab && Icon ? (
                  <AppTabContent fixedSize pending={isPendingTab}>
                    <Tooltip title={label}>
                      <span className="inline-flex h-5 w-5 items-center justify-center leading-none">
                        <Icon className="block text-lg" />
                      </span>
                    </Tooltip>
                  </AppTabContent>
                ) : undefined
              }
              label={isIconOnlyTab ? undefined : <AppTabContent pending={isPendingTab}>{label}</AppTabContent>}
              to={link.href}
              viewTransition
              classes={{
                selected: '!text-white font-bold text-shadow-md',
                root: `!rounded-lg transition-colors z-1 !py-0 !min-h-2.5rem !h-2.5rem ${
                  isIconOnlyTab ? '!min-w-2.5rem !w-2.5rem !px-0' : ''
                }`,
              }}
              value={link.value}
            />
          )
        })}
      </Tabs>
    </div>
  )
}