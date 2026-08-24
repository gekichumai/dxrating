import { oc, type InferContractRouterInputs, type InferContractRouterOutputs } from '@orpc/contract'
import {
  CHART_REPORT_CATEGORY_KEYS,
  CHART_REPORT_FIELD_KEYS,
  ChartReportCategoryKeySchema as CanonicalChartReportCategoryKeySchema,
  ChartReportFieldKeySchema as CanonicalChartReportFieldKeySchema,
  ChartReportJsonSnapshotSchema as CanonicalChartReportJsonSnapshotSchema,
  ChartReportPublicChartIdSchema as CanonicalChartReportPublicChartIdSchema,
  ChartReportPublicSongIdSchema as CanonicalChartReportPublicSongIdSchema,
  ChartReportPublicationRevisionSchema as CanonicalChartReportPublicationRevisionSchema,
} from '@gekichumai/api-contract'
import { z } from 'zod'

export const ADMIN_CONTRACT_HEADER = 'x-dxrating-admin-contract' as const
export const ADMIN_CLIENT_INCOMPATIBLE_MESSAGE = 'The administrator client and backend contracts do not match' as const

export const ADMIN_ERROR_MESSAGES = {
  UNAUTHENTICATED: 'Administrator authentication is required',
  FORBIDDEN: 'Administrator access is not permitted',
  RECENT_AUTH_REQUIRED: 'Recent primary authentication is required',
  FRESH_LOGIN_REQUIRED: 'A fresh login is required after the authority change',
  STEP_UP_FAILED: 'Primary authentication could not be verified',
  STEP_UP_RATE_LIMITED: 'Primary authentication could not be verified at this time',
  VALIDATION_FAILED: 'The administrator request is invalid',
  INVALID_CURSOR: 'The administrator pagination cursor is invalid',
  NOT_FOUND: 'The requested administrator resource was not found',
  CHART_UNAVAILABLE: 'Administrator chart context is unavailable',
  CONFLICT: 'The administrator request conflicts with current state',
  INTERNAL_SERVER_ERROR: 'The administrator request could not be completed',
} as const

export const ADMIN_PRIMARY_AUTH_ACTIONS = [
  'administrator.grant',
  'administrator.revoke',
  'user.ban',
  'user.unban',
  'comment.delete',
  'comment.restore',
  'chart_report.close',
  'chart_report.submit',
  'provenance.read',
  'dashboard.read',
  'raw_artifact.read',
] as const

export type AdminPrimaryAuthAction = (typeof ADMIN_PRIMARY_AUTH_ACTIONS)[number]

export const ADMIN_PRIMARY_AUTH_ACTION_POLICY = {
  'administrator.grant': true,
  'administrator.revoke': true,
  'user.ban': true,
  'user.unban': true,
  'comment.delete': true,
  'comment.restore': false,
  'chart_report.close': false,
  'chart_report.submit': false,
  'provenance.read': false,
  'dashboard.read': false,
  'raw_artifact.read': false,
} as const satisfies Readonly<Record<AdminPrimaryAuthAction, boolean>>

export const adminActionRequiresRecentPrimaryAuth = (action: AdminPrimaryAuthAction): boolean =>
  ADMIN_PRIMARY_AUTH_ACTION_POLICY[action]

export const AdminPrimaryAuthActionSchema = z.enum(ADMIN_PRIMARY_AUTH_ACTIONS)

export const AdminProcedureAuthorizationPolicySchema = z
  .object({
    minimumRole: z.enum(['admin', 'super_admin']),
    recentPrimaryAuth: z.boolean(),
    freshLogin: z.boolean(),
    primaryAuthAction: AdminPrimaryAuthActionSchema.nullable(),
    targetAction: z.enum(['moderate', 'manage_administrator_role']).nullable(),
  })
  .refine((policy) => !(policy.recentPrimaryAuth && policy.freshLogin), {
    message: 'Recent primary authentication and fresh login policies are mutually exclusive',
  })
  .refine(
    (policy) =>
      policy.primaryAuthAction === null
        ? !policy.recentPrimaryAuth
        : policy.recentPrimaryAuth === adminActionRequiresRecentPrimaryAuth(policy.primaryAuthAction),
    {
      message: 'Recent primary authentication must match the central action policy',
    },
  )

export type AdminProcedureAuthorizationPolicy = Readonly<z.infer<typeof AdminProcedureAuthorizationPolicySchema>>

export const AdminProcedureBanPolicySchema = z.enum([
  'unclassified',
  'authenticated_read',
  'authenticated_write',
  'transactional_write',
])
export type AdminProcedureBanPolicy = z.infer<typeof AdminProcedureBanPolicySchema>

export type AdminProcedureMetadata = {
  readonly authorization: AdminProcedureAuthorizationPolicy
  /**
   * Explicit identity-side-effect classification. `unclassified` is a
   * fail-closed sentinel so new administrator procedures cannot silently
   * bypass active-ban review. `transactional_write` is reserved for a
   * target-authorized service that rechecks actor, target, and session while
   * holding its own canonical PostgreSQL row locks.
   */
  readonly banPolicy: AdminProcedureBanPolicy
}

export const ADMIN_DEFAULT_AUTHORIZATION = {
  minimumRole: 'admin',
  recentPrimaryAuth: false,
  freshLogin: false,
  primaryAuthAction: null,
  targetAction: null,
} as const satisfies AdminProcedureAuthorizationPolicy

export const adminAuthorizationForAction = (
  action: AdminPrimaryAuthAction,
  overrides: Pick<AdminProcedureAuthorizationPolicy, 'minimumRole' | 'targetAction'> = {
    minimumRole: ADMIN_DEFAULT_AUTHORIZATION.minimumRole,
    targetAction: ADMIN_DEFAULT_AUTHORIZATION.targetAction,
  },
): AdminProcedureAuthorizationPolicy => ({
  ...overrides,
  freshLogin: false,
  primaryAuthAction: action,
  recentPrimaryAuth: adminActionRequiresRecentPrimaryAuth(action),
})

export const ADMIN_BOOTSTRAP_AUTHORIZATION = {
  ...ADMIN_DEFAULT_AUTHORIZATION,
} as const satisfies AdminProcedureAuthorizationPolicy

export const AdminContractCompatibilityIdSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const AdminCorrelationIdSchema = z.uuid()

export const AdminErrorDataSchema = z.object({
  requestId: AdminCorrelationIdSchema.nullable(),
})

export const AdminBootstrapInputSchema = z.object({
  headers: z.object({
    [ADMIN_CONTRACT_HEADER]: AdminContractCompatibilityIdSchema.optional(),
  }),
})

export const AdminEffectiveRoleSchema = z.enum(['admin', 'super_admin'])

export const AdminCapabilitiesSchema = z.object({
  canModerateUsers: z.boolean(),
  canModerateAdministrators: z.boolean(),
  canManageAdministrators: z.boolean(),
})

export const AdminPrincipalSchema = z.object({
  userId: z.string().min(1),
  effectiveRole: AdminEffectiveRoleSchema,
  capabilities: AdminCapabilitiesSchema,
})

export const AdminBootstrapOutputSchema = z.object({
  contractCompatibilityId: AdminContractCompatibilityIdSchema,
  ready: z.literal(true),
  principal: AdminPrincipalSchema,
})

export const AdminClientIncompatibleDataSchema = AdminErrorDataSchema.extend({
  expected: AdminContractCompatibilityIdSchema,
  received: AdminContractCompatibilityIdSchema.nullable(),
})

export const adminErrors = {
  ADMIN_CLIENT_INCOMPATIBLE: {
    status: 409,
    message: ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
    data: AdminClientIncompatibleDataSchema,
  },
  UNAUTHENTICATED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.UNAUTHENTICATED,
    data: AdminErrorDataSchema,
  },
  FORBIDDEN: {
    status: 403,
    message: ADMIN_ERROR_MESSAGES.FORBIDDEN,
    data: AdminErrorDataSchema,
  },
  RECENT_AUTH_REQUIRED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.RECENT_AUTH_REQUIRED,
    data: AdminErrorDataSchema,
  },
  FRESH_LOGIN_REQUIRED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.FRESH_LOGIN_REQUIRED,
    data: AdminErrorDataSchema,
  },
  STEP_UP_FAILED: {
    status: 401,
    message: ADMIN_ERROR_MESSAGES.STEP_UP_FAILED,
    data: AdminErrorDataSchema,
  },
  STEP_UP_RATE_LIMITED: {
    status: 429,
    message: ADMIN_ERROR_MESSAGES.STEP_UP_RATE_LIMITED,
    data: AdminErrorDataSchema,
  },
  VALIDATION_FAILED: {
    status: 400,
    message: ADMIN_ERROR_MESSAGES.VALIDATION_FAILED,
    data: AdminErrorDataSchema,
  },
  INVALID_CURSOR: {
    status: 400,
    message: ADMIN_ERROR_MESSAGES.INVALID_CURSOR,
    data: AdminErrorDataSchema,
  },
  NOT_FOUND: {
    status: 404,
    message: ADMIN_ERROR_MESSAGES.NOT_FOUND,
    data: AdminErrorDataSchema,
  },
  CHART_UNAVAILABLE: {
    status: 503,
    message: ADMIN_ERROR_MESSAGES.CHART_UNAVAILABLE,
    data: AdminErrorDataSchema,
  },
  CONFLICT: {
    status: 409,
    message: ADMIN_ERROR_MESSAGES.CONFLICT,
    data: AdminErrorDataSchema,
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    message: ADMIN_ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    data: AdminErrorDataSchema,
  },
} as const

const adminProcedure = oc.$meta<AdminProcedureMetadata>({
  authorization: ADMIN_DEFAULT_AUTHORIZATION,
  banPolicy: 'unclassified',
})

export const AdminPrimaryAuthProviderSchema = z.enum(['google'])
export type AdminPrimaryAuthProvider = z.infer<typeof AdminPrimaryAuthProviderSchema>
export const AdminPrimaryAuthWindowOutputSchema = z.object({
  active: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
})
export const AdminPrimaryAuthCompletionOutputSchema = z.object({
  completed: z.literal(true),
  expiresAt: z.iso.datetime(),
})

const AdminContractHeadersSchema = z.object({
  [ADMIN_CONTRACT_HEADER]: AdminContractCompatibilityIdSchema.optional(),
})

export const AdminPrimaryAuthPasswordInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  body: z.object({ password: z.string().min(1).max(1024) }),
})

export const AdminPrimaryAuthOauthInitiateInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  body: z.object({ provider: AdminPrimaryAuthProviderSchema }),
})

export const AdminPrimaryAuthOauthInitiateOutputSchema = z.object({
  authorizationUrl: z.url(),
})

export const ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH = 1_000 as const
export const ADMIN_ROLE_HISTORY_CURSOR_MAX_LENGTH = 1_024 as const
export const ADMIN_ROLE_HISTORY_DEFAULT_LIMIT = 50 as const
export const ADMIN_ROLE_HISTORY_MAX_LIMIT = 100 as const

export const AdminUserIdSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((userId) => userId === userId.trim(), {
    message: 'User IDs must not contain surrounding whitespace',
  })
export const AdminPersistedRoleSchema = z.enum(['user', 'admin'])
export const AdminRoleSourceSchema = z.enum(['database', 'deployment'])
export const AdminRoleChangeReasonSchema = z.string().trim().min(1).max(ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH)
export const AdminRoleHistoryCursorSchema = z
  .string()
  .min(1)
  .max(ADMIN_ROLE_HISTORY_CURSOR_MAX_LENGTH)
  .describe('Opaque administrator role-history cursor')
export const AdminRoleHistoryLimitSchema = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(ADMIN_ROLE_HISTORY_MAX_LIMIT)
  .default(ADMIN_ROLE_HISTORY_DEFAULT_LIMIT)

export const AdminAccountStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('active') }).strict(),
  z
    .object({
      status: z.literal('temporarily_banned'),
      expiresAt: z.iso.datetime(),
    })
    .strict(),
  z
    .object({
      status: z.literal('permanently_banned'),
    })
    .strict(),
])

const AdminAdministratorRosterIdentitySchema = z.object({
  userId: AdminUserIdSchema,
  displayName: z.string().min(1).max(255),
  email: z.email().max(320),
  emailVerified: z.boolean(),
  accountStatus: AdminAccountStatusSchema,
})

export const AdminAdministratorRosterEntrySchema = z.discriminatedUnion('effectiveRole', [
  AdminAdministratorRosterIdentitySchema.extend({
    effectiveRole: z.literal('admin'),
    roleSource: z.literal('database'),
  }),
  AdminAdministratorRosterIdentitySchema.extend({
    effectiveRole: z.literal('super_admin'),
    roleSource: z.literal('deployment'),
  }),
])

export const AdminAdministratorRosterOutputSchema = z.object({
  items: z.array(AdminAdministratorRosterEntrySchema),
})

export const AdminRoleChangeIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(19)
const AdminAdministratorRoleChangeBaseSchema = z.object({
  id: AdminRoleChangeIdSchema,
  subjectUserId: AdminUserIdSchema,
  actorUserId: AdminUserIdSchema,
  reason: AdminRoleChangeReasonSchema,
  changedAt: z.iso.datetime(),
})
export const AdminAdministratorGrantChangeSchema = AdminAdministratorRoleChangeBaseSchema.extend({
  previousRole: z.literal('user'),
  newRole: z.literal('admin'),
})
export const AdminAdministratorRevokeChangeSchema = AdminAdministratorRoleChangeBaseSchema.extend({
  previousRole: z.literal('admin'),
  newRole: z.literal('user'),
})
export const AdminAdministratorRoleChangeSchema = z.discriminatedUnion('newRole', [
  AdminAdministratorGrantChangeSchema,
  AdminAdministratorRevokeChangeSchema,
])

export const AdminAdministratorRoleHistoryInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  params: z.object({ userId: AdminUserIdSchema }),
  query: z.object({
    cursor: AdminRoleHistoryCursorSchema.optional(),
    limit: AdminRoleHistoryLimitSchema,
  }),
})

export const AdminAdministratorRoleHistoryOutputSchema = z.object({
  items: z.array(AdminAdministratorRoleChangeSchema).max(ADMIN_ROLE_HISTORY_MAX_LIMIT),
  nextCursor: AdminRoleHistoryCursorSchema.nullable(),
})

const createAdminRoleChangeInputSchema = () =>
  z.object({
    headers: AdminContractHeadersSchema,
    params: z.object({ userId: AdminUserIdSchema }),
    body: z.object({ reason: AdminRoleChangeReasonSchema }),
  })

export const AdminGrantAdministratorInputSchema = createAdminRoleChangeInputSchema()
export const AdminRevokeAdministratorInputSchema = createAdminRoleChangeInputSchema()

export const AdminGrantAdministratorOutputSchema = z.object({
  change: AdminAdministratorGrantChangeSchema,
})
export const AdminRevokeAdministratorOutputSchema = z.object({
  change: AdminAdministratorRevokeChangeSchema,
})

export const ADMIN_USER_SEARCH_DEFAULT_LIMIT = 25 as const
export const ADMIN_USER_SEARCH_MAX_LIMIT = 100 as const
export const ADMIN_USER_HISTORY_DEFAULT_LIMIT = 25 as const
export const ADMIN_USER_HISTORY_MAX_LIMIT = 100 as const
export const ADMIN_USER_SEARCH_CURSOR_MAX_LENGTH = 1_024 as const
export const ADMIN_USER_HISTORY_CURSOR_MAX_LENGTH = 1_024 as const
export const ADMIN_USER_DISPLAY_NAME_PREFIX_MIN_LENGTH = 2 as const
export const ADMIN_USER_BAN_REASON_MAX_LENGTH = 1_000 as const
export const ADMIN_USER_TEMPORARY_BAN_MAX_DURATION_DAYS = 365 as const

const canonicalizeAdminUserSearchText = (value: string): string => value.normalize('NFKC').trim().replace(/\s+/gu, ' ')

export const AdminUserSearchEmailSchema = z
  .string()
  .overwrite((value) => canonicalizeAdminUserSearchText(value).toLowerCase())
  .email()
  .max(320)
export const AdminUserDisplayNamePrefixSchema = z
  .string()
  .overwrite(canonicalizeAdminUserSearchText)
  .min(ADMIN_USER_DISPLAY_NAME_PREFIX_MIN_LENGTH)
  .max(255)
export const AdminUserEffectiveRoleSchema = z.enum(['user', 'admin', 'super_admin'])
export const AdminUserSearchCursorSchema = z
  .string()
  .min(1)
  .max(ADMIN_USER_SEARCH_CURSOR_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe('Opaque user-search cursor bound to the normalized filters')
export const AdminUserHistoryCursorSchema = z
  .string()
  .min(1)
  .max(ADMIN_USER_HISTORY_CURSOR_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe('Opaque subject-bound user-ban-history cursor')
export const AdminUserSearchLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(ADMIN_USER_SEARCH_MAX_LIMIT)
  .default(ADMIN_USER_SEARCH_DEFAULT_LIMIT)
export const AdminUserHistoryLimitSchema = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(ADMIN_USER_HISTORY_MAX_LIMIT)
  .default(ADMIN_USER_HISTORY_DEFAULT_LIMIT)
export const AdminUserBanStateVersionSchema = AdminRoleChangeIdSchema
export const AdminUserBanReasonSchema = z.string().trim().min(1).max(ADMIN_USER_BAN_REASON_MAX_LENGTH)
export const AdminUtcDateTimeSchema = z.iso.datetime().describe('UTC ISO 8601 timestamp')

export const AdminUserModerationIdentitySchema = z
  .object({
    userId: AdminUserIdSchema,
    displayName: z.string().min(1).max(255),
    email: z.email().max(320),
    emailVerified: z.boolean(),
    effectiveRole: AdminUserEffectiveRoleSchema,
  })
  .strict()

export const AdminUserSearchRowSchema = AdminUserModerationIdentitySchema.extend({
  accountStatus: AdminAccountStatusSchema,
}).strict()

const AdminUnbannedUserStateSchema = z
  .object({
    status: z.literal('unbanned'),
    stateVersion: AdminUserBanStateVersionSchema.nullable(),
    reason: z.null(),
    actorUserId: AdminUserIdSchema.nullable(),
    banStartedAt: z.null(),
    expiresAt: z.null(),
    evaluatedAt: AdminUtcDateTimeSchema,
  })
  .strict()
  .refine((state) => (state.stateVersion === null) === (state.actorUserId === null), {
    message: 'Unbanned state version and actor must either both be present or both be absent',
  })

const AdminExpiredUserBanStateSchema = z
  .object({
    status: z.literal('expired'),
    stateVersion: AdminUserBanStateVersionSchema,
    reason: AdminUserBanReasonSchema,
    actorUserId: AdminUserIdSchema,
    banStartedAt: AdminUtcDateTimeSchema,
    expiresAt: AdminUtcDateTimeSchema,
    evaluatedAt: AdminUtcDateTimeSchema,
  })
  .strict()
  .refine(
    (state) =>
      Date.parse(state.banStartedAt) <= Date.parse(state.expiresAt) &&
      Date.parse(state.expiresAt) <= Date.parse(state.evaluatedAt),
    { message: 'Expired ban timestamps are inconsistent' },
  )

const AdminTemporaryUserBanStateSchema = z
  .object({
    status: z.literal('temporary'),
    stateVersion: AdminUserBanStateVersionSchema,
    reason: AdminUserBanReasonSchema,
    actorUserId: AdminUserIdSchema,
    banStartedAt: AdminUtcDateTimeSchema,
    expiresAt: AdminUtcDateTimeSchema,
    evaluatedAt: AdminUtcDateTimeSchema,
  })
  .strict()
  .refine(
    (state) =>
      Date.parse(state.banStartedAt) <= Date.parse(state.evaluatedAt) &&
      Date.parse(state.evaluatedAt) < Date.parse(state.expiresAt),
    { message: 'Temporary ban timestamps are inconsistent' },
  )

const AdminPermanentUserBanStateSchema = z
  .object({
    status: z.literal('permanent'),
    stateVersion: AdminUserBanStateVersionSchema,
    reason: AdminUserBanReasonSchema,
    actorUserId: AdminUserIdSchema,
    banStartedAt: AdminUtcDateTimeSchema,
    expiresAt: z.null(),
    evaluatedAt: AdminUtcDateTimeSchema,
  })
  .strict()
  .refine((state) => Date.parse(state.banStartedAt) <= Date.parse(state.evaluatedAt), {
    message: 'Permanent ban timestamps are inconsistent',
  })

export const AdminUserBanStateSchema = z.discriminatedUnion('status', [
  AdminUnbannedUserStateSchema,
  AdminExpiredUserBanStateSchema,
  AdminTemporaryUserBanStateSchema,
  AdminPermanentUserBanStateSchema,
])

const AdminUserBanHistoryEventBaseSchema = z.object({
  id: AdminUserBanStateVersionSchema,
  subjectUserId: AdminUserIdSchema,
  actorUserId: AdminUserIdSchema,
  previousEventId: AdminUserBanStateVersionSchema.nullable(),
  createdAt: AdminUtcDateTimeSchema,
})

const AdminTemporaryUserBanHistoryEventSchema = AdminUserBanHistoryEventBaseSchema.extend({
  action: z.literal('ban'),
  kind: z.literal('temporary'),
  reason: AdminUserBanReasonSchema,
  banStartedAt: AdminUtcDateTimeSchema,
  expiresAt: AdminUtcDateTimeSchema,
})
  .strict()
  .refine(
    (event) =>
      Date.parse(event.banStartedAt) <= Date.parse(event.createdAt) &&
      Date.parse(event.createdAt) < Date.parse(event.expiresAt),
    { message: 'Temporary ban event timestamps are inconsistent' },
  )

const AdminPermanentUserBanHistoryEventSchema = AdminUserBanHistoryEventBaseSchema.extend({
  action: z.literal('ban'),
  kind: z.literal('permanent'),
  reason: AdminUserBanReasonSchema,
  banStartedAt: AdminUtcDateTimeSchema,
  expiresAt: z.null(),
})
  .strict()
  .refine((event) => Date.parse(event.banStartedAt) <= Date.parse(event.createdAt), {
    message: 'Permanent ban event timestamps are inconsistent',
  })

const AdminUserUnbanHistoryEventSchema = AdminUserBanHistoryEventBaseSchema.extend({
  action: z.literal('unban'),
  kind: z.null(),
  reason: AdminUserBanReasonSchema.nullable(),
  banStartedAt: z.null(),
  expiresAt: z.null(),
}).strict()

export const AdminUserBanHistoryEventSchema = z.union([
  AdminTemporaryUserBanHistoryEventSchema,
  AdminPermanentUserBanHistoryEventSchema,
  AdminUserUnbanHistoryEventSchema,
])

export const AdminSearchUsersInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  body: z
    .object({
      userId: AdminUserIdSchema.optional(),
      email: AdminUserSearchEmailSchema.optional(),
      displayName: AdminUserDisplayNamePrefixSchema.optional(),
      effectiveRole: AdminUserEffectiveRoleSchema.optional(),
      activeBan: z.boolean().optional(),
      cursor: AdminUserSearchCursorSchema.optional(),
      limit: AdminUserSearchLimitSchema,
    })
    .strict(),
})

export const AdminSearchUsersOutputSchema = z
  .object({
    items: z.array(AdminUserSearchRowSchema).max(ADMIN_USER_SEARCH_MAX_LIMIT),
    nextCursor: AdminUserSearchCursorSchema.nullable(),
  })
  .strict()

const AdminUserSubjectInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  params: z.object({ userId: AdminUserIdSchema }),
})

export const AdminGetUserModerationDetailInputSchema = AdminUserSubjectInputSchema
export const AdminGetUserModerationDetailOutputSchema = AdminUserModerationIdentitySchema.extend({
  banState: AdminUserBanStateSchema,
}).strict()

export const AdminListUserBanHistoryInputSchema = AdminUserSubjectInputSchema.extend({
  query: z.object({
    cursor: AdminUserHistoryCursorSchema.optional(),
    limit: AdminUserHistoryLimitSchema,
  }),
})
export const AdminListUserBanHistoryOutputSchema = z
  .object({
    items: z.array(AdminUserBanHistoryEventSchema).max(ADMIN_USER_HISTORY_MAX_LIMIT),
    nextCursor: AdminUserHistoryCursorSchema.nullable(),
  })
  .strict()

const AdminUserBanMutationBaseShape = {
  expectedStateVersion: AdminUserBanStateVersionSchema.nullable(),
  reason: AdminUserBanReasonSchema,
}

export const AdminBanUserBodySchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...AdminUserBanMutationBaseShape,
      kind: z.literal('temporary'),
      expiresAt: AdminUtcDateTimeSchema.describe(
        `UTC expiry no more than ${ADMIN_USER_TEMPORARY_BAN_MAX_DURATION_DAYS} days after server time`,
      ),
    })
    .strict(),
  z
    .object({
      ...AdminUserBanMutationBaseShape,
      kind: z.literal('permanent'),
    })
    .strict(),
])

export const AdminBanUserInputSchema = AdminUserSubjectInputSchema.extend({
  body: AdminBanUserBodySchema,
})
export const AdminUnbanUserInputSchema = AdminUserSubjectInputSchema.extend({
  body: z.object({ expectedStateVersion: AdminUserBanStateVersionSchema.nullable() }).strict(),
})
export const AdminUserBanMutationOutputSchema = z
  .object({
    state: AdminUserBanStateSchema,
    event: AdminUserBanHistoryEventSchema,
  })
  .strict()

export const ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT = 25 as const
export const ADMIN_COMMENT_HISTORY_MAX_LIMIT = 100 as const
export const ADMIN_COMMENT_HISTORY_CURSOR_MAX_LENGTH = 1_024 as const
export const ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH = 1_000 as const
export const ADMIN_RECENT_COMMENT_DEFAULT_LIMIT = 50 as const
export const ADMIN_RECENT_COMMENT_MAX_LIMIT = 100 as const
export const ADMIN_RECENT_COMMENT_CURSOR_MAX_LENGTH = 1_024 as const
export const ADMIN_COMMENT_PREVIEW_MAX_LENGTH = 240 as const
export const ADMIN_DELETED_COMMENT_PREVIEW = '[deleted]' as const
export const ADMIN_COMMENT_THREAD_DEFAULT_LIMIT = 100 as const
export const ADMIN_COMMENT_THREAD_MAX_LIMIT = 250 as const
export const ADMIN_COMMENT_THREAD_CURSOR_MAX_LENGTH = 1_024 as const

export const AdminCommentIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(19)
  .describe('Decimal comment identifier')
export const AdminCommentModerationEventIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(19)
  .describe('Decimal comment-moderation state version')
export const AdminCommentHistoryCursorSchema = z
  .string()
  .min(1)
  .max(ADMIN_COMMENT_HISTORY_CURSOR_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe('Opaque comment-bound moderation-history cursor')
export const AdminCommentHistoryLimitSchema = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(ADMIN_COMMENT_HISTORY_MAX_LIMIT)
  .default(ADMIN_COMMENT_HISTORY_DEFAULT_LIMIT)
export const AdminRecentCommentCursorSchema = z
  .string()
  .min(1)
  .max(ADMIN_RECENT_COMMENT_CURSOR_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe('Opaque recent-comment cursor bound to the normalized filters and `(createdAt, id)` keyset')
export const AdminRecentCommentLimitSchema = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(ADMIN_RECENT_COMMENT_MAX_LIMIT)
  .default(ADMIN_RECENT_COMMENT_DEFAULT_LIMIT)
export const AdminCommentThreadCursorSchema = z
  .string()
  .min(1)
  .max(ADMIN_COMMENT_THREAD_CURSOR_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe('Opaque requested-comment-bound cursor for a deterministic thread segment')
export const AdminCommentThreadLimitSchema = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(ADMIN_COMMENT_THREAD_MAX_LIMIT)
  .default(ADMIN_COMMENT_THREAD_DEFAULT_LIMIT)
export const AdminCommentModerationReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH)

export const AdminRecentCommentStatusSchema = z.enum(['active', 'deleted'])
export const AdminPublicSongIdSchema = z
  .string()
  .regex(/^dsng_[23456789abcdefghjkmnpqrstvwxyz]{10}$/)
  .describe('Stable public song identifier')
export const AdminChartIdSchema = z
  .string()
  .regex(/^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$/)
  .describe('Stable public chart identifier')

const AdminCommentDateBoundSchema = z.iso.datetime().overwrite((value) => new Date(value).toISOString())
const hasOrderedCommentDateBounds = ({
  createdAtFromInclusive,
  createdAtBeforeExclusive,
}: {
  readonly createdAtFromInclusive?: string | null
  readonly createdAtBeforeExclusive?: string | null
}) =>
  createdAtFromInclusive === undefined ||
  createdAtFromInclusive === null ||
  createdAtBeforeExclusive === undefined ||
  createdAtBeforeExclusive === null ||
  Date.parse(createdAtFromInclusive) < Date.parse(createdAtBeforeExclusive)

export const AdminListRecentCommentsInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  query: z
    .object({
      authorUserId: AdminUserIdSchema.optional(),
      chartId: AdminChartIdSchema.optional(),
      status: AdminRecentCommentStatusSchema.optional(),
      createdAtFromInclusive: AdminCommentDateBoundSchema.optional(),
      createdAtBeforeExclusive: AdminCommentDateBoundSchema.optional(),
      cursor: AdminRecentCommentCursorSchema.optional(),
      limit: AdminRecentCommentLimitSchema,
    })
    .strict()
    .refine(hasOrderedCommentDateBounds, {
      message: 'The inclusive comment date bound must precede the exclusive bound',
      path: ['createdAtBeforeExclusive'],
    }),
})

export const AdminNormalizedRecentCommentFiltersSchema = z
  .object({
    authorUserId: AdminUserIdSchema.nullable(),
    chartId: AdminChartIdSchema.nullable(),
    status: AdminRecentCommentStatusSchema.nullable(),
    createdAtFromInclusive: AdminCommentDateBoundSchema.nullable(),
    createdAtBeforeExclusive: AdminCommentDateBoundSchema.nullable(),
  })
  .strict()
  .refine(hasOrderedCommentDateBounds, {
    message: 'The normalized inclusive comment date bound must precede the exclusive bound',
    path: ['createdAtBeforeExclusive'],
  })

const AdminCatalogIdentitySchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .max(19)

export const AdminActiveCatalogPublicationSchema = z
  .object({
    channel: z.literal('production-v1'),
    catalogRunId: AdminCatalogIdentitySchema,
    revision: AdminCatalogIdentitySchema,
  })
  .strict()

const AdminPersistedCommentChartReferenceSchema = z
  .object({
    legacySongId: z.string().min(1).max(1_024),
    sheetType: z.string().min(1).max(255),
    sheetDifficulty: z.string().min(1).max(255),
  })
  .strict()

const hasAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint <= 0x1f || codePoint === 0x7f
  })

const AdminSafeChartDisplayLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !hasAsciiControlCharacter(value), {
    message: 'Chart display labels must not contain controls',
  })

const AdminCommentChartContextBaseShape = {
  legacyReference: AdminPersistedCommentChartReferenceSchema,
  songLabel: AdminSafeChartDisplayLabelSchema,
  chartLabel: AdminSafeChartDisplayLabelSchema,
}

const AdminCurrentCommentChartContextSchema = z
  .object({
    availability: z.literal('current'),
    ...AdminCommentChartContextBaseShape,
    songId: AdminPublicSongIdSchema,
    chartId: AdminChartIdSchema,
  })
  .strict()

const AdminHistoricalCommentChartContextSchema = z
  .object({
    availability: z.literal('historical'),
    ...AdminCommentChartContextBaseShape,
    songId: AdminPublicSongIdSchema,
    chartId: AdminChartIdSchema,
  })
  .strict()

const AdminUnresolvedCommentChartContextSchema = z
  .object({
    availability: z.literal('unresolved'),
    ...AdminCommentChartContextBaseShape,
    songId: z.null(),
    chartId: z.null(),
  })
  .strict()

export const AdminCommentChartContextSchema = z.discriminatedUnion('availability', [
  AdminCurrentCommentChartContextSchema,
  AdminHistoricalCommentChartContextSchema,
  AdminUnresolvedCommentChartContextSchema,
])

export const AdminCommentAuthorSummarySchema = z
  .object({
    userId: AdminUserIdSchema,
    displayName: z.string().min(1).max(255),
    effectiveRole: AdminUserEffectiveRoleSchema,
    isBanned: z.boolean(),
  })
  .strict()

export const AdminRecentCommentRowSchema = z
  .object({
    id: AdminCommentIdSchema,
    parentId: AdminCommentIdSchema.nullable(),
    rootId: AdminCommentIdSchema,
    createdAt: AdminUtcDateTimeSchema,
    status: AdminRecentCommentStatusSchema,
    bodyPreview: z.string().max(ADMIN_COMMENT_PREVIEW_MAX_LENGTH),
    bodyPreviewTruncated: z.boolean(),
    author: AdminCommentAuthorSummarySchema,
    chart: AdminCommentChartContextSchema,
  })
  .strict()
  .superRefine((row, context) => {
    if (row.parentId === null && row.rootId !== row.id) {
      context.addIssue({
        code: 'custom',
        message: 'A root comment must identify itself as the root',
        path: ['rootId'],
      })
    }
    if (row.status === 'deleted') {
      if (row.bodyPreview !== ADMIN_DELETED_COMMENT_PREVIEW) {
        context.addIssue({
          code: 'custom',
          message: 'Deleted comments require the generic preview',
          path: ['bodyPreview'],
        })
      }
      if (row.bodyPreviewTruncated) {
        context.addIssue({
          code: 'custom',
          message: 'The deleted preview is never truncated',
          path: ['bodyPreviewTruncated'],
        })
      }
    }
  })

export const AdminListRecentCommentsOutputSchema = z
  .object({
    items: z.array(AdminRecentCommentRowSchema).max(ADMIN_RECENT_COMMENT_MAX_LIMIT),
    nextCursor: AdminRecentCommentCursorSchema.nullable(),
    normalizedFilters: AdminNormalizedRecentCommentFiltersSchema,
    activePublication: AdminActiveCatalogPublicationSchema.nullable(),
  })
  .strict()
  .refine(
    (output) =>
      output.activePublication !== null || output.items.every(({ chart }) => chart.availability !== 'current'),
    {
      message: 'Current chart contexts require an active publication',
      path: ['activePublication'],
    },
  )

export const AdminCommentImmutableEvidenceSchema = z
  .object({
    id: AdminCommentIdSchema,
    parentId: AdminCommentIdSchema.nullable(),
    rootId: AdminCommentIdSchema,
    authorUserId: AdminUserIdSchema,
    chart: AdminCommentChartContextSchema,
    createdAt: AdminUtcDateTimeSchema,
    originalBody: z.string(),
  })
  .strict()
  .refine((comment) => comment.parentId !== null || comment.rootId === comment.id, {
    message: 'A root comment must identify itself as the root',
    path: ['rootId'],
  })
  .describe('Privileged immutable comment evidence available only to authorized administrators')

const AdminVisibleCommentModerationStateSchema = z
  .object({
    status: z.literal('visible'),
    stateVersion: AdminCommentModerationEventIdSchema.nullable(),
    actorUserId: AdminUserIdSchema.nullable(),
    moderatedAt: AdminUtcDateTimeSchema.nullable(),
    reason: z.null(),
  })
  .strict()
  .refine(
    (state) =>
      state.stateVersion === null
        ? state.actorUserId === null && state.moderatedAt === null
        : state.actorUserId !== null && state.moderatedAt !== null,
    {
      message: 'Visible comment state metadata must consistently represent initial or restored state',
    },
  )

const AdminDeletedCommentModerationStateSchema = z
  .object({
    status: z.literal('deleted'),
    stateVersion: AdminCommentModerationEventIdSchema,
    actorUserId: AdminUserIdSchema,
    moderatedAt: AdminUtcDateTimeSchema,
    reason: AdminCommentModerationReasonSchema,
  })
  .strict()

export const AdminCommentModerationStateSchema = z.discriminatedUnion('status', [
  AdminVisibleCommentModerationStateSchema,
  AdminDeletedCommentModerationStateSchema,
])

const AdminCommentModerationEventBaseSchema = z.object({
  id: AdminCommentModerationEventIdSchema,
  commentId: AdminCommentIdSchema,
  actorUserId: AdminUserIdSchema,
  previousEventId: AdminCommentModerationEventIdSchema.nullable(),
  createdAt: AdminUtcDateTimeSchema,
})

const AdminCommentDeleteEventSchema = AdminCommentModerationEventBaseSchema.extend({
  action: z.literal('delete'),
  reason: AdminCommentModerationReasonSchema,
})
  .strict()
  .refine((event) => event.id !== event.previousEventId, {
    message: 'A comment-moderation event cannot reference itself as its previous event',
  })

const AdminCommentRestoreEventSchema = AdminCommentModerationEventBaseSchema.extend({
  action: z.literal('restore'),
  previousEventId: AdminCommentModerationEventIdSchema,
  reason: z.null(),
})
  .strict()
  .refine((event) => event.id !== event.previousEventId, {
    message: 'A comment-moderation event cannot reference itself as its previous event',
  })

export const AdminCommentModerationEventSchema = z.discriminatedUnion('action', [
  AdminCommentDeleteEventSchema,
  AdminCommentRestoreEventSchema,
])

export const AdminCommentThreadItemSchema = z
  .object({
    id: AdminCommentIdSchema,
    parentId: AdminCommentIdSchema.nullable(),
    rootId: AdminCommentIdSchema,
    depth: z.number().int().nonnegative(),
    createdAt: AdminUtcDateTimeSchema,
    originalBody: z.string(),
    state: AdminCommentModerationStateSchema,
    author: AdminCommentAuthorSummarySchema,
  })
  .strict()
  .superRefine((item, context) => {
    if (item.depth === 0 && (item.parentId !== null || item.rootId !== item.id)) {
      context.addIssue({
        code: 'custom',
        message: 'The depth-zero thread item must be its root',
        path: ['rootId'],
      })
    }
    if (item.depth > 0 && (item.parentId === null || item.rootId === item.id)) {
      context.addIssue({
        code: 'custom',
        message: 'A reply must identify its parent and distinct root',
        path: ['rootId'],
      })
    }
  })

export const AdminCommentThreadPageSchema = z
  .object({
    items: z.array(AdminCommentThreadItemSchema).max(ADMIN_COMMENT_THREAD_MAX_LIMIT),
    completeness: z.enum(['complete', 'partial']),
    nextCursor: AdminCommentThreadCursorSchema.nullable(),
  })
  .strict()
  .superRefine((page, context) => {
    if ((page.completeness === 'complete') !== (page.nextCursor === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Thread completeness and continuation must agree',
        path: ['nextCursor'],
      })
    }
    if (page.completeness === 'partial' && page.items.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'A partial thread segment must make progress',
        path: ['items'],
      })
    }
  })

export const AdminCommentModerationHistoryPageSchema = z
  .object({
    items: z.array(AdminCommentModerationEventSchema).max(ADMIN_COMMENT_HISTORY_MAX_LIMIT),
    nextCursor: AdminCommentHistoryCursorSchema.nullable(),
  })
  .strict()

export const AdminCommentAuthorBanHistoryPageSchema = z
  .object({
    items: z.array(AdminUserBanHistoryEventSchema).max(ADMIN_USER_HISTORY_MAX_LIMIT),
    nextCursor: AdminUserHistoryCursorSchema.nullable(),
  })
  .strict()

const AdminCommentSubjectInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  params: z.object({ commentId: AdminCommentIdSchema }).strict(),
})

export const AdminGetCommentModerationDetailInputSchema = AdminCommentSubjectInputSchema.extend({
  query: z
    .object({
      threadCursor: AdminCommentThreadCursorSchema.optional(),
      threadLimit: AdminCommentThreadLimitSchema,
      commentHistoryCursor: AdminCommentHistoryCursorSchema.optional(),
      commentHistoryLimit: AdminCommentHistoryLimitSchema,
      authorBanHistoryCursor: AdminUserHistoryCursorSchema.optional(),
      authorBanHistoryLimit: AdminUserHistoryLimitSchema,
    })
    .strict(),
})

export const AdminGetCommentModerationDetailOutputSchema = z
  .object({
    activePublication: AdminActiveCatalogPublicationSchema.nullable(),
    comment: AdminCommentImmutableEvidenceSchema,
    state: AdminCommentModerationStateSchema,
    author: AdminGetUserModerationDetailOutputSchema,
    thread: AdminCommentThreadPageSchema,
    commentHistory: AdminCommentModerationHistoryPageSchema,
    authorBanHistory: AdminCommentAuthorBanHistoryPageSchema,
  })
  .strict()
  .superRefine((output, context) => {
    if (output.author.userId !== output.comment.authorUserId) {
      context.addIssue({
        code: 'custom',
        message: 'The user detail must belong to the comment author',
        path: ['author'],
      })
    }
    if (output.commentHistory.items.some((event) => event.commentId !== output.comment.id)) {
      context.addIssue({
        code: 'custom',
        message: 'Comment-moderation history items must belong to the requested comment detail',
        path: ['commentHistory', 'items'],
      })
    }
    if (output.authorBanHistory.items.some((event) => event.subjectUserId !== output.author.userId)) {
      context.addIssue({
        code: 'custom',
        message: 'Ban-history items must belong to the selected comment author',
        path: ['authorBanHistory', 'items'],
      })
    }
    if (output.thread.items.some((item) => item.rootId !== output.comment.rootId)) {
      context.addIssue({
        code: 'custom',
        message: 'Every thread item must belong to the selected comment root',
        path: ['thread', 'items'],
      })
    }
    if (new Set(output.thread.items.map(({ id }) => id)).size !== output.thread.items.length) {
      context.addIssue({
        code: 'custom',
        message: 'A thread segment cannot repeat a comment',
        path: ['thread', 'items'],
      })
    }
    if (output.comment.chart.availability === 'current' && output.activePublication === null) {
      context.addIssue({
        code: 'custom',
        message: 'A current chart context requires an active publication',
        path: ['activePublication'],
      })
    }
  })

export const AdminDeleteCommentInputSchema = AdminCommentSubjectInputSchema.extend({
  body: z
    .object({
      expectedStateVersion: AdminCommentModerationEventIdSchema.nullable(),
      confirmed: z.literal(true),
      reason: AdminCommentModerationReasonSchema,
    })
    .strict(),
})

export const AdminRestoreCommentInputSchema = AdminCommentSubjectInputSchema.extend({
  body: z
    .object({
      expectedStateVersion: AdminCommentModerationEventIdSchema,
      confirmed: z.literal(true),
    })
    .strict(),
})

export const AdminDeleteCommentOutputSchema = z
  .object({
    state: AdminDeletedCommentModerationStateSchema,
    event: AdminCommentDeleteEventSchema,
  })
  .strict()
  .refine(
    ({ state, event }) =>
      state.stateVersion === event.id &&
      state.actorUserId === event.actorUserId &&
      state.moderatedAt === event.createdAt &&
      state.reason === event.reason,
    {
      message: 'Comment-deletion state and event must describe the same transition',
    },
  )

export const AdminRestoreCommentOutputSchema = z
  .object({
    state: AdminVisibleCommentModerationStateSchema,
    event: AdminCommentRestoreEventSchema,
  })
  .strict()
  .refine(
    ({ state, event }) =>
      state.stateVersion === event.id &&
      state.actorUserId === event.actorUserId &&
      state.moderatedAt === event.createdAt,
    {
      message: 'Comment-restoration state and event must describe the same transition',
    },
  )

export const AdminCommentModerationMutationOutputSchema = z.union([
  AdminDeleteCommentOutputSchema,
  AdminRestoreCommentOutputSchema,
])

export const ADMIN_CHART_REPORT_DEFAULT_LIMIT = 50 as const
export const ADMIN_CHART_REPORT_MAX_LIMIT = 100 as const
export const ADMIN_CHART_REPORT_CURSOR_MAX_LENGTH = 1_024 as const
export const ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH = 240 as const
export const ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH = 1_000 as const
export const ADMIN_CHART_REPORT_SOURCE_URL_MAX_COUNT = 5 as const
export const ADMIN_CHART_REPORT_SOURCE_URL_MAX_LENGTH = 2_048 as const

type CanonicalChartReportFieldKey = (typeof CHART_REPORT_FIELD_KEYS)[number]
type CanonicalChartReportCategoryKey = (typeof CHART_REPORT_CATEGORY_KEYS)[number]
type CanonicalChartReportJsonSnapshot = string | number | boolean | null | Readonly<Record<string, number>>

// Keep one runtime authority for the public identifiers, keys, and submitted
// value envelope while hiding the dependency package's private Zod instance
// from this package's generated declaration types.
const ChartReportFieldKeySchema: z.ZodType<CanonicalChartReportFieldKey, CanonicalChartReportFieldKey> =
  CanonicalChartReportFieldKeySchema as unknown as z.ZodType<CanonicalChartReportFieldKey, CanonicalChartReportFieldKey>
const ChartReportCategoryKeySchema: z.ZodType<CanonicalChartReportCategoryKey, CanonicalChartReportCategoryKey> =
  CanonicalChartReportCategoryKeySchema as unknown as z.ZodType<
    CanonicalChartReportCategoryKey,
    CanonicalChartReportCategoryKey
  >
const ChartReportJsonSnapshotSchema: z.ZodType<CanonicalChartReportJsonSnapshot, CanonicalChartReportJsonSnapshot> =
  CanonicalChartReportJsonSnapshotSchema as unknown as z.ZodType<
    CanonicalChartReportJsonSnapshot,
    CanonicalChartReportJsonSnapshot
  >
const ChartReportPublicChartIdSchema: z.ZodType<string, string> =
  CanonicalChartReportPublicChartIdSchema as unknown as z.ZodType<string, string>
const ChartReportPublicSongIdSchema: z.ZodType<string, string> =
  CanonicalChartReportPublicSongIdSchema as unknown as z.ZodType<string, string>
const ChartReportPublicationRevisionSchema: z.ZodType<string, string> =
  CanonicalChartReportPublicationRevisionSchema as unknown as z.ZodType<string, string>

export const AdminChartReportIdSchema = z
  .string()
  .uuid()
  .overwrite((value) => value.toLowerCase())
  .describe('Chart-report UUID')
export const AdminChartReportStateSchema = z.enum(['open', 'closed'])
export const AdminChartReportCursorSchema = z
  .string()
  .min(1)
  .max(ADMIN_CHART_REPORT_CURSOR_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)
  .describe(
    'Opaque cursor bound to normalized filters, a fixed traversal boundary, and the deterministic `(open-first, createdAt DESC, id DESC)` keyset',
  )
export const AdminChartReportLimitSchema = z.coerce
  .number<number>()
  .int()
  .min(1)
  .max(ADMIN_CHART_REPORT_MAX_LIMIT)
  .default(ADMIN_CHART_REPORT_DEFAULT_LIMIT)
export const AdminChartReportDateBoundSchema = z.iso.datetime().overwrite((value) => new Date(value).toISOString())

const hasOrderedChartReportDateBounds = ({
  submittedAtFromInclusive,
  submittedAtBeforeExclusive,
}: {
  readonly submittedAtFromInclusive?: string | null
  readonly submittedAtBeforeExclusive?: string | null
}) =>
  submittedAtFromInclusive === undefined ||
  submittedAtFromInclusive === null ||
  submittedAtBeforeExclusive === undefined ||
  submittedAtBeforeExclusive === null ||
  Date.parse(submittedAtFromInclusive) < Date.parse(submittedAtBeforeExclusive)

const AdminChartReportFilterShape = {
  state: AdminChartReportStateSchema.optional(),
  chartId: ChartReportPublicChartIdSchema.optional(),
  fieldKey: ChartReportFieldKeySchema.optional(),
  category: ChartReportCategoryKeySchema.optional(),
  reporterUserId: AdminUserIdSchema.optional(),
  submittedAtFromInclusive: AdminChartReportDateBoundSchema.optional(),
  submittedAtBeforeExclusive: AdminChartReportDateBoundSchema.optional(),
  publicationRevision: ChartReportPublicationRevisionSchema.optional(),
}

export const AdminNormalizedChartReportFiltersSchema = z
  .object({
    state: AdminChartReportStateSchema.nullable(),
    chartId: ChartReportPublicChartIdSchema.nullable(),
    fieldKey: ChartReportFieldKeySchema.nullable(),
    category: ChartReportCategoryKeySchema.nullable(),
    reporterUserId: AdminUserIdSchema.nullable(),
    submittedAtFromInclusive: AdminChartReportDateBoundSchema.nullable(),
    submittedAtBeforeExclusive: AdminChartReportDateBoundSchema.nullable(),
    publicationRevision: ChartReportPublicationRevisionSchema.nullable(),
  })
  .strict()
  .refine(hasOrderedChartReportDateBounds, {
    message: 'The normalized inclusive submission date bound must precede the exclusive bound',
    path: ['submittedAtBeforeExclusive'],
  })

export const AdminListChartReportsInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  query: z
    .object({
      ...AdminChartReportFilterShape,
      cursor: AdminChartReportCursorSchema.optional(),
      limit: AdminChartReportLimitSchema,
    })
    .strict()
    .refine(hasOrderedChartReportDateBounds, {
      message: 'The inclusive submission date bound must precede the exclusive bound',
      path: ['submittedAtBeforeExclusive'],
    }),
})

export const AdminChartReportPublicationSchema = z
  .object({
    channel: z.literal('production-v1'),
    catalogRunId: AdminCatalogIdentitySchema,
    revision: ChartReportPublicationRevisionSchema,
    fingerprintSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

export const AdminChartReportChartSummarySchema = z
  .object({
    songId: ChartReportPublicSongIdSchema,
    chartId: ChartReportPublicChartIdSchema,
    songLabel: AdminSafeChartDisplayLabelSchema,
    chartLabel: AdminSafeChartDisplayLabelSchema,
  })
  .strict()

export const AdminChartReportReporterSummarySchema = z
  .object({
    userId: AdminUserIdSchema,
    displayName: z.string().min(1).max(255),
    emailVerified: z.boolean(),
    effectiveRole: AdminUserEffectiveRoleSchema,
    accountStatus: AdminAccountStatusSchema,
  })
  .strict()
  .describe('Approved reporter identity and moderation fields; excludes authentication and request metadata')

export const AdminChartReportValuePreviewSchema = z
  .object({
    text: z.string().min(1).max(ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH),
    truncated: z.boolean(),
  })
  .strict()

export const AdminChartReportQueueRowSchema = z
  .object({
    id: AdminChartReportIdSchema,
    state: AdminChartReportStateSchema,
    chart: AdminChartReportChartSummarySchema,
    fieldKey: ChartReportFieldKeySchema,
    category: ChartReportCategoryKeySchema,
    currentValuePreview: AdminChartReportValuePreviewSchema,
    proposedValuePreview: AdminChartReportValuePreviewSchema,
    explanationPreview: z.string().min(1).max(ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH),
    explanationPreviewTruncated: z.boolean(),
    createdAt: AdminUtcDateTimeSchema,
    capturedPublication: AdminChartReportPublicationSchema,
    reporter: AdminChartReportReporterSummarySchema,
  })
  .strict()

export const AdminListChartReportsOutputSchema = z
  .object({
    items: z.array(AdminChartReportQueueRowSchema).max(ADMIN_CHART_REPORT_MAX_LIMIT),
    nextCursor: AdminChartReportCursorSchema.nullable(),
    normalizedFilters: AdminNormalizedChartReportFiltersSchema,
  })
  .strict()

export const AdminChartReportCapturedContextSchema = z
  .object({
    publication: AdminChartReportPublicationSchema,
    chart: AdminChartReportChartSummarySchema,
  })
  .strict()

const AdminCurrentChartReportContextSchema = z
  .object({
    availability: z.literal('current'),
    publication: AdminChartReportPublicationSchema,
    chart: AdminChartReportChartSummarySchema,
    currentValue: ChartReportJsonSnapshotSchema,
  })
  .strict()

const AdminRetiredChartReportContextSchema = z
  .object({
    availability: z.literal('retired'),
    publication: AdminChartReportPublicationSchema,
    songId: ChartReportPublicSongIdSchema,
    chartId: ChartReportPublicChartIdSchema,
  })
  .strict()

export const AdminChartReportCurrentContextSchema = z.discriminatedUnion('availability', [
  AdminCurrentChartReportContextSchema,
  AdminRetiredChartReportContextSchema,
])

export const AdminChartReportClosureSchema = z
  .object({
    actorUserId: AdminUserIdSchema,
    closedAt: AdminUtcDateTimeSchema,
    internalNote: z.string().min(1).max(ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH).nullable(),
  })
  .strict()

const AdminChartReportDetailBaseSchema = z.object({
  id: AdminChartReportIdSchema,
  fieldKey: ChartReportFieldKeySchema,
  category: ChartReportCategoryKeySchema,
  submittedCurrentValue: ChartReportJsonSnapshotSchema,
  submittedProposedValue: ChartReportJsonSnapshotSchema,
  explanation: z.string().trim().min(1).max(4_000),
  sourceUrls: z
    .array(
      z
        .url()
        .max(ADMIN_CHART_REPORT_SOURCE_URL_MAX_LENGTH)
        .refine((value) => {
          try {
            const protocol = new URL(value).protocol
            return protocol === 'http:' || protocol === 'https:'
          } catch {
            return false
          }
        }, 'Chart-report evidence URLs must use HTTP or HTTPS'),
    )
    .max(ADMIN_CHART_REPORT_SOURCE_URL_MAX_COUNT),
  createdAt: AdminUtcDateTimeSchema,
  capturedContext: AdminChartReportCapturedContextSchema,
})

const AdminOpenChartReportDetailSchema = AdminChartReportDetailBaseSchema.extend({
  state: z.literal('open'),
  closure: z.null(),
}).strict()

const AdminClosedChartReportDetailSchema = AdminChartReportDetailBaseSchema.extend({
  state: z.literal('closed'),
  closure: AdminChartReportClosureSchema,
}).strict()

export const AdminChartReportDetailSchema = z.discriminatedUnion('state', [
  AdminOpenChartReportDetailSchema,
  AdminClosedChartReportDetailSchema,
])

export const AdminGetChartReportDetailInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  params: z.object({ reportId: AdminChartReportIdSchema }).strict(),
})

export const AdminGetChartReportDetailOutputSchema = z
  .object({
    reporter: AdminChartReportReporterSummarySchema,
    report: AdminChartReportDetailSchema,
    currentContext: AdminChartReportCurrentContextSchema,
  })
  .strict()
  .superRefine((output, context) => {
    if (
      output.currentContext.availability === 'current' &&
      (output.currentContext.chart.songId !== output.report.capturedContext.chart.songId ||
        output.currentContext.chart.chartId !== output.report.capturedContext.chart.chartId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Captured and current contexts must identify the same stable chart',
        path: ['currentContext', 'chart'],
      })
    }
    if (
      output.currentContext.availability === 'retired' &&
      (output.currentContext.songId !== output.report.capturedContext.chart.songId ||
        output.currentContext.chartId !== output.report.capturedContext.chart.chartId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The retired context must identify the captured stable chart',
        path: ['currentContext'],
      })
    }
  })

export const AdminChartReportCloseNoteSchema = z.string().trim().min(1).max(ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH)

export const AdminCloseChartReportInputSchema = z.object({
  headers: AdminContractHeadersSchema,
  params: z.object({ reportId: AdminChartReportIdSchema }).strict(),
  body: z
    .object({
      expectedState: z.literal('open'),
      internalNote: AdminChartReportCloseNoteSchema.nullable().default(null),
    })
    .strict(),
})

export const AdminCloseChartReportOutputSchema = z
  .object({
    id: AdminChartReportIdSchema,
    state: z.literal('closed'),
    closure: AdminChartReportClosureSchema,
  })
  .strict()

export const adminContract = adminProcedure.errors(adminErrors).router({
  bootstrap: adminProcedure
    .meta({
      authorization: ADMIN_BOOTSTRAP_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/bootstrap',
      operationId: 'getAdminBootstrap',
      summary: 'Validate the private administrator client contract',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminBootstrapInputSchema)
    .output(AdminBootstrapOutputSchema),
  primaryAuthStatus: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/primary-auth/status',
      operationId: 'getAdminPrimaryAuthStatus',
      summary: 'Read the current session primary-authentication window',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminBootstrapInputSchema)
    .output(AdminPrimaryAuthWindowOutputSchema),
  completePrimaryAuthPassword: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_write',
    })
    .route({
      method: 'POST',
      path: '/primary-auth/password',
      operationId: 'completeAdminPrimaryAuthPassword',
      summary: 'Complete primary authentication with the current password',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminPrimaryAuthPasswordInputSchema)
    .output(AdminPrimaryAuthCompletionOutputSchema),
  initiatePrimaryAuthOauth: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_write',
    })
    .route({
      method: 'POST',
      path: '/primary-auth/oauth/initiate',
      operationId: 'initiateAdminPrimaryAuthOauth',
      summary: 'Initiate provider-bound OAuth primary authentication',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminPrimaryAuthOauthInitiateInputSchema)
    .output(AdminPrimaryAuthOauthInitiateOutputSchema),
  searchUsers: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'POST',
      path: '/users/search',
      operationId: 'searchAdminUsers',
      summary: 'Search accounts for administrator moderation',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminSearchUsersInputSchema)
    .output(AdminSearchUsersOutputSchema),
  getUserModerationDetail: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/users/{userId}',
      operationId: 'getAdminUserModerationDetail',
      summary: 'Read approved moderation detail for one account',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminGetUserModerationDetailInputSchema)
    .output(AdminGetUserModerationDetailOutputSchema),
  listUserBanHistory: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/users/{userId}/ban-history',
      operationId: 'listAdminUserBanHistory',
      summary: 'List immutable ban history for one account',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminListUserBanHistoryInputSchema)
    .output(AdminListUserBanHistoryOutputSchema),
  banUser: adminProcedure
    .meta({
      banPolicy: 'transactional_write',
      authorization: adminAuthorizationForAction('user.ban', {
        minimumRole: 'admin',
        targetAction: 'moderate',
      }),
    })
    .route({
      method: 'POST',
      path: '/users/{userId}/ban',
      operationId: 'banAdminUser',
      summary: 'Apply a temporary or permanent account ban',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminBanUserInputSchema)
    .output(AdminUserBanMutationOutputSchema),
  unbanUser: adminProcedure
    .meta({
      banPolicy: 'transactional_write',
      authorization: adminAuthorizationForAction('user.unban', {
        minimumRole: 'admin',
        targetAction: 'moderate',
      }),
    })
    .route({
      method: 'POST',
      path: '/users/{userId}/unban',
      operationId: 'unbanAdminUser',
      summary: 'Remove an active account ban',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminUnbanUserInputSchema)
    .output(AdminUserBanMutationOutputSchema),
  listRecentComments: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/comments',
      operationId: 'listAdminRecentComments',
      summary: 'List recent comments with bounded moderation context',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminListRecentCommentsInputSchema)
    .output(AdminListRecentCommentsOutputSchema),
  getCommentModerationDetail: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/comments/{commentId}',
      operationId: 'getAdminCommentModerationDetail',
      summary: 'Read a comment, its thread, chart context, author context, and moderation histories',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminGetCommentModerationDetailInputSchema)
    .output(AdminGetCommentModerationDetailOutputSchema),
  deleteComment: adminProcedure
    .meta({
      banPolicy: 'transactional_write',
      authorization: adminAuthorizationForAction('comment.delete', {
        minimumRole: 'admin',
        targetAction: 'moderate',
      }),
    })
    .route({
      method: 'POST',
      path: '/comments/{commentId}/delete',
      operationId: 'deleteAdminComment',
      summary: 'Hide a comment while preserving its immutable original evidence',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminDeleteCommentInputSchema)
    .output(AdminDeleteCommentOutputSchema),
  restoreComment: adminProcedure
    .meta({
      banPolicy: 'transactional_write',
      authorization: adminAuthorizationForAction('comment.restore', {
        minimumRole: 'admin',
        targetAction: 'moderate',
      }),
    })
    .route({
      method: 'POST',
      path: '/comments/{commentId}/restore',
      operationId: 'restoreAdminComment',
      summary: 'Restore a deleted comment without rewriting its original evidence',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminRestoreCommentInputSchema)
    .output(AdminRestoreCommentOutputSchema),
  listChartReports: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/chart-reports',
      operationId: 'listAdminChartReports',
      summary: 'List chart reports with bounded moderation context',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminListChartReportsInputSchema)
    .output(AdminListChartReportsOutputSchema),
  getChartReportDetail: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/chart-reports/{reportId}',
      operationId: 'getAdminChartReportDetail',
      summary: 'Read immutable report evidence and compare it with the active chart publication',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminGetChartReportDetailInputSchema)
    .output(AdminGetChartReportDetailOutputSchema),
  closeChartReport: adminProcedure
    .meta({
      authorization: adminAuthorizationForAction('chart_report.close'),
      banPolicy: 'authenticated_write',
    })
    .route({
      method: 'POST',
      path: '/chart-reports/{reportId}/close',
      operationId: 'closeAdminChartReport',
      summary: 'Atomically close an open chart report without rewriting its submitted evidence',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminCloseChartReportInputSchema)
    .output(AdminCloseChartReportOutputSchema),
  listAdministrators: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/administrators',
      operationId: 'listAdminAdministrators',
      summary: 'List the administrator roster',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminBootstrapInputSchema)
    .output(AdminAdministratorRosterOutputSchema),
  listAdministratorRoleHistory: adminProcedure
    .meta({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    .route({
      method: 'GET',
      path: '/administrators/{userId}/role-history',
      operationId: 'listAdminAdministratorRoleHistory',
      summary: 'List immutable administrator role history for one account',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminAdministratorRoleHistoryInputSchema)
    .output(AdminAdministratorRoleHistoryOutputSchema),
  grantAdministrator: adminProcedure
    .meta({
      banPolicy: 'transactional_write',
      authorization: adminAuthorizationForAction('administrator.grant', {
        minimumRole: 'super_admin',
        targetAction: 'manage_administrator_role',
      }),
    })
    .route({
      method: 'POST',
      path: '/administrators/{userId}/grant',
      operationId: 'grantAdminAdministrator',
      summary: 'Grant the database administrator role to an existing account',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminGrantAdministratorInputSchema)
    .output(AdminGrantAdministratorOutputSchema),
  revokeAdministrator: adminProcedure
    .meta({
      banPolicy: 'transactional_write',
      authorization: adminAuthorizationForAction('administrator.revoke', {
        minimumRole: 'super_admin',
        targetAction: 'manage_administrator_role',
      }),
    })
    .route({
      method: 'POST',
      path: '/administrators/{userId}/revoke',
      operationId: 'revokeAdminAdministrator',
      summary: 'Revoke the database administrator role from an account',
      tags: ['Admin'],
      inputStructure: 'detailed',
    })
    .input(AdminRevokeAdministratorInputSchema)
    .output(AdminRevokeAdministratorOutputSchema),
})

export type AdminContract = typeof adminContract
export type AdminContractInputs = InferContractRouterInputs<AdminContract>
export type AdminContractOutputs = InferContractRouterOutputs<AdminContract>