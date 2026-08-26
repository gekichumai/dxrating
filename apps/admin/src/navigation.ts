import {
  IconChartBar,
  IconGauge,
  IconMessageCircle,
  IconReportAnalytics,
  IconShieldLock,
  IconUsers,
} from '@tabler/icons-react'
import type { MessageKey } from './i18n'

export type AdminDestinationId = 'dashboard' | 'charts' | 'comments' | 'users' | 'administrators' | 'chartReports'

export type AdminDestination = {
  readonly id: AdminDestinationId
  readonly to: '/' | '/charts' | '/comments' | '/users' | '/administrators' | '/chart-reports'
  readonly labelKey: MessageKey
  readonly titleKey: MessageKey
  readonly descriptionKey: MessageKey
  readonly icon: typeof IconGauge
}

export const ADMIN_DESTINATIONS = [
  {
    id: 'dashboard',
    to: '/',
    labelKey: 'nav.dashboard',
    titleKey: 'page.dashboard.title',
    descriptionKey: 'page.dashboard.description',
    icon: IconGauge,
  },
  {
    id: 'charts',
    to: '/charts',
    labelKey: 'nav.charts',
    titleKey: 'page.charts.title',
    descriptionKey: 'page.charts.description',
    icon: IconChartBar,
  },
  {
    id: 'comments',
    to: '/comments',
    labelKey: 'nav.comments',
    titleKey: 'page.comments.title',
    descriptionKey: 'page.comments.description',
    icon: IconMessageCircle,
  },
  {
    id: 'users',
    to: '/users',
    labelKey: 'nav.users',
    titleKey: 'page.users.title',
    descriptionKey: 'page.users.description',
    icon: IconUsers,
  },
  {
    id: 'administrators',
    to: '/administrators',
    labelKey: 'nav.administrators',
    titleKey: 'page.administrators.title',
    descriptionKey: 'page.administrators.description',
    icon: IconShieldLock,
  },
  {
    id: 'chartReports',
    to: '/chart-reports',
    labelKey: 'nav.chartReports',
    titleKey: 'page.chartReports.title',
    descriptionKey: 'page.chartReports.description',
    icon: IconReportAnalytics,
  },
] as const satisfies readonly AdminDestination[]

export const getAdminDestination = (pathname: string): AdminDestination =>
  ADMIN_DESTINATIONS.find((destination) =>
    destination.to === '/'
      ? pathname === '/'
      : pathname === destination.to || pathname.startsWith(`${destination.to}/`),
  ) ?? ADMIN_DESTINATIONS[0]

export const getAdminDestinationById = (id: AdminDestinationId): AdminDestination =>
  ADMIN_DESTINATIONS.find((destination) => destination.id === id) ?? ADMIN_DESTINATIONS[0]