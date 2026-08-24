export type AdminQueryPrimitive = boolean | number | string | null
export type AdminQueryValue =
  | AdminQueryPrimitive
  | readonly AdminQueryValue[]
  | { readonly [key: string]: AdminQueryValue | undefined }
export type AdminQueryParameters = Readonly<Record<string, AdminQueryValue | undefined>>

const EMPTY_QUERY_PARAMETERS: AdminQueryParameters = Object.freeze({})

export const adminQueryKeys = {
  all: () => ['admin'] as const,
  bootstrap: () => [...adminQueryKeys.all(), 'bootstrap'] as const,
  primaryAuth: {
    all: () => [...adminQueryKeys.all(), 'primary-auth'] as const,
    status: () => [...adminQueryKeys.primaryAuth.all(), 'status'] as const,
  },
  dashboard: {
    all: () => [...adminQueryKeys.all(), 'dashboard'] as const,
    overview: () => [...adminQueryKeys.dashboard.all(), 'overview'] as const,
  },
  charts: {
    all: () => [...adminQueryKeys.all(), 'charts'] as const,
    lists: () => [...adminQueryKeys.charts.all(), 'list'] as const,
    list: (parameters: AdminQueryParameters = EMPTY_QUERY_PARAMETERS) =>
      [...adminQueryKeys.charts.lists(), parameters] as const,
    details: () => [...adminQueryKeys.charts.all(), 'detail'] as const,
    detail: (chartId: string) => [...adminQueryKeys.charts.details(), chartId] as const,
    provenance: (chartId: string) => [...adminQueryKeys.charts.detail(chartId), 'provenance'] as const,
    fieldProvenance: (chartId: string, field: string) =>
      [...adminQueryKeys.charts.provenance(chartId), 'field', field] as const,
  },
  revisions: {
    all: () => [...adminQueryKeys.all(), 'revisions'] as const,
    byChartRoot: () => [...adminQueryKeys.revisions.all(), 'chart'] as const,
    byChart: (chartId: string) => [...adminQueryKeys.revisions.byChartRoot(), chartId] as const,
    detail: (chartId: string, revisionId: string) =>
      [...adminQueryKeys.revisions.byChart(chartId), 'detail', revisionId] as const,
  },
  comments: {
    all: () => [...adminQueryKeys.all(), 'comments'] as const,
    lists: () => [...adminQueryKeys.comments.all(), 'list'] as const,
    list: (parameters: AdminQueryParameters = EMPTY_QUERY_PARAMETERS) =>
      [...adminQueryKeys.comments.lists(), parameters] as const,
    details: () => [...adminQueryKeys.comments.all(), 'detail'] as const,
    detail: (commentId: string) => [...adminQueryKeys.comments.details(), commentId] as const,
  },
  users: {
    all: () => [...adminQueryKeys.all(), 'users'] as const,
    lists: () => [...adminQueryKeys.users.all(), 'list'] as const,
    list: (parameters: AdminQueryParameters = EMPTY_QUERY_PARAMETERS) =>
      [...adminQueryKeys.users.lists(), parameters] as const,
    details: () => [...adminQueryKeys.users.all(), 'detail'] as const,
    detail: (userId: string) => [...adminQueryKeys.users.details(), userId] as const,
    activity: (userId: string) => [...adminQueryKeys.users.detail(userId), 'activity'] as const,
  },
  administrators: {
    all: () => [...adminQueryKeys.all(), 'administrators'] as const,
    lists: () => [...adminQueryKeys.administrators.all(), 'list'] as const,
    list: (parameters: AdminQueryParameters = EMPTY_QUERY_PARAMETERS) =>
      [...adminQueryKeys.administrators.lists(), parameters] as const,
    details: () => [...adminQueryKeys.administrators.all(), 'detail'] as const,
    detail: (userId: string) => [...adminQueryKeys.administrators.details(), userId] as const,
  },
  reports: {
    all: () => [...adminQueryKeys.all(), 'reports'] as const,
    lists: () => [...adminQueryKeys.reports.all(), 'list'] as const,
    list: (parameters: AdminQueryParameters = EMPTY_QUERY_PARAMETERS) =>
      [...adminQueryKeys.reports.lists(), parameters] as const,
    details: () => [...adminQueryKeys.reports.all(), 'detail'] as const,
    detail: (reportId: string) => [...adminQueryKeys.reports.details(), reportId] as const,
  },
} as const