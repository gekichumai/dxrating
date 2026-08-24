import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from '@tanstack/react-router'
import { AdminNotFound, AdminRouteError, RouteLoading } from './components/route-states'

const rootRoute = createRootRoute({
  component: Outlet,
  pendingComponent: RouteLoading,
  errorComponent: AdminRouteError,
  notFoundComponent: AdminNotFound,
})

const requireAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'require-admin',
  component: lazyRouteComponent(() => import('./auth/admin-authorization-boundary'), 'AdminAuthorizationBoundary'),
})

const workspaceRoute = createRoute({
  getParentRoute: () => requireAdminRoute,
  id: 'workspace',
  component: lazyRouteComponent(() => import('./components/protected-admin-providers'), 'ProtectedAdminProviders'),
})

const primaryAuthResultRoute = createRoute({
  getParentRoute: () => requireAdminRoute,
  path: 'primary-auth/result',
  component: lazyRouteComponent(() => import('./routes/primary-auth-result-route'), 'PrimaryAuthResultRoute'),
})

const shellRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  id: 'admin-shell',
  component: lazyRouteComponent(() => import('./components/admin-shell'), 'AdminShell'),
})

const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./routes/dashboard-route'), 'DashboardRoute'),
})

const chartsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'charts',
  component: lazyRouteComponent(() => import('./routes/charts-route'), 'ChartsRoute'),
})

const commentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'comments',
  component: lazyRouteComponent(() => import('./routes/comments-route'), 'CommentsRoute'),
})

const usersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'users',
  component: lazyRouteComponent(() => import('./routes/users-route'), 'UsersRoute'),
})

const administratorsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'administrators',
  component: lazyRouteComponent(() => import('./routes/administrators-route'), 'AdministratorsRoute'),
})

const chartReportsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: 'chart-reports',
  component: lazyRouteComponent(() => import('./routes/chart-reports-route'), 'ChartReportsRoute'),
})

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sign-in',
  component: lazyRouteComponent(() => import('./routes/sign-in-route'), 'SignInRoute'),
})

export const adminRouteTree = rootRoute.addChildren([
  signInRoute,
  requireAdminRoute.addChildren([
    primaryAuthResultRoute,
    workspaceRoute.addChildren([
      shellRoute.addChildren([
        dashboardRoute,
        chartsRoute,
        commentsRoute,
        usersRoute,
        administratorsRoute,
        chartReportsRoute,
      ]),
    ]),
  ]),
])

export const createAdminRouter = ({ history }: { history?: RouterHistory } = {}) =>
  createRouter({
    routeTree: adminRouteTree,
    history,
    defaultPreload: 'intent',
    defaultPendingMs: 0,
    defaultPendingMinMs: 250,
    scrollRestoration: true,
  })

export const adminRouter = createAdminRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>
  }
}