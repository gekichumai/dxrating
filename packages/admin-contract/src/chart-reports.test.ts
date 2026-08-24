import { publicAppContract } from '@gekichumai/api-contract'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH,
  ADMIN_CHART_REPORT_DEFAULT_LIMIT,
  ADMIN_CHART_REPORT_MAX_LIMIT,
  ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH,
  ADMIN_DEFAULT_AUTHORIZATION,
  AdminChartReportDetailSchema,
  AdminChartReportQueueRowSchema,
  AdminCloseChartReportInputSchema,
  AdminCloseChartReportOutputSchema,
  AdminGetChartReportDetailInputSchema,
  AdminGetChartReportDetailOutputSchema,
  AdminListChartReportsInputSchema,
  AdminListChartReportsOutputSchema,
  adminAuthorizationForAction,
  adminContract,
} from './contract.js'
import { generateAdminOpenApiDocument } from './openapi.js'

const publication = {
  channel: 'production-v1' as const,
  catalogRunId: '81',
  revision: '144',
  fingerprintSha256: 'a'.repeat(64),
}

const chart = {
  songId: 'dsng_23456789ab',
  chartId: 'dsht_23456789ab',
  songLabel: 'World’s End Loneliness',
  chartLabel: 'DX · MASTER',
}

const reporter = {
  userId: 'reporter-user',
  displayName: 'Chart Reporter',
  emailVerified: false,
  effectiveRole: 'user' as const,
  accountStatus: { status: 'active' as const },
}

const queueRow = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  state: 'open' as const,
  chart,
  fieldKey: 'chart.internal_level' as const,
  category: 'incorrect_value' as const,
  currentValuePreview: { text: '14.7', truncated: false },
  proposedValuePreview: { text: '14.8', truncated: false },
  explanationPreview: 'The value differs from the cited official listing.',
  explanationPreviewTruncated: false,
  createdAt: '2026-08-24T10:00:00.000Z',
  capturedPublication: publication,
  reporter,
}

const normalizedFilters = {
  state: null,
  chartId: null,
  fieldKey: null,
  category: null,
  reporterUserId: null,
  submittedAtFromInclusive: null,
  submittedAtBeforeExclusive: null,
  publicationRevision: null,
}

const openReport = {
  id: queueRow.id,
  state: 'open' as const,
  fieldKey: queueRow.fieldKey,
  category: queueRow.category,
  submittedCurrentValue: 14.7,
  submittedProposedValue: 14.8,
  explanation: 'The value differs from the cited official listing.',
  sourceUrls: ['https://example.com/evidence?revision=144'],
  createdAt: queueRow.createdAt,
  capturedContext: { publication, chart },
  closure: null,
}

describe('private chart-report administrator contract', () => {
  it('exposes only the bounded list, detail, and close management procedures', async () => {
    expect(
      Object.fromEntries(
        ['listChartReports', 'getChartReportDetail', 'closeChartReport'].map((name) => {
          const procedure = adminContract[name as keyof typeof adminContract]
          return [name, procedure['~orpc'].route]
        }),
      ),
    ).toEqual({
      listChartReports: expect.objectContaining({
        method: 'GET',
        path: '/chart-reports',
        operationId: 'listAdminChartReports',
      }),
      getChartReportDetail: expect.objectContaining({
        method: 'GET',
        path: '/chart-reports/{reportId}',
        operationId: 'getAdminChartReportDetail',
      }),
      closeChartReport: expect.objectContaining({
        method: 'POST',
        path: '/chart-reports/{reportId}/close',
        operationId: 'closeAdminChartReport',
      }),
    })

    expect(adminContract.listChartReports['~orpc'].meta).toEqual({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    expect(adminContract.getChartReportDetail['~orpc'].meta).toEqual({
      authorization: ADMIN_DEFAULT_AUTHORIZATION,
      banPolicy: 'authenticated_read',
    })
    expect(adminContract.closeChartReport['~orpc'].meta).toEqual({
      authorization: adminAuthorizationForAction('chart_report.close'),
      banPolicy: 'authenticated_write',
    })

    const document = await generateAdminOpenApiDocument()
    expect(document.paths?.['/chart-reports']).toEqual(
      expect.objectContaining({ get: expect.objectContaining({ operationId: 'listAdminChartReports' }) }),
    )
    expect(
      document.paths?.['/chart-reports']?.get?.parameters?.map((parameter) =>
        '$ref' in parameter ? parameter.$ref : `${parameter.in}:${parameter.name}`,
      ),
    ).toEqual([
      'query:state',
      'query:chartId',
      'query:fieldKey',
      'query:category',
      'query:reporterUserId',
      'query:submittedAtFromInclusive',
      'query:submittedAtBeforeExclusive',
      'query:publicationRevision',
      'query:cursor',
      'query:limit',
      'header:x-dxrating-admin-contract',
    ])
    expect(document.paths?.['/chart-reports/{reportId}']).toEqual(
      expect.objectContaining({ get: expect.objectContaining({ operationId: 'getAdminChartReportDetail' }) }),
    )
    expect(document.paths?.['/chart-reports/{reportId}/close']).toEqual(
      expect.objectContaining({ post: expect.objectContaining({ operationId: 'closeAdminChartReport' }) }),
    )
    const serializedDocument = JSON.stringify(document)
    expect(serializedDocument).not.toMatch(/chart-reports.*\/(reopen|delete|edit|assign|merge|bulk-close)/i)
    expect(serializedDocument).not.toMatch(/reporter-notif|github|duplicate-link/i)

    expect(Object.keys(publicAppContract.chartReports)).toEqual(['resolveContext', 'create'])
    expect(JSON.stringify(publicAppContract.chartReports)).not.toMatch(
      /close|internalNote|listChartReports|getChartReport/i,
    )
  })

  it('normalizes every queue filter and rejects unstable or unbounded combinations', () => {
    expect(AdminListChartReportsInputSchema.parse({ headers: {}, query: {} })).toEqual({
      headers: {},
      query: { limit: ADMIN_CHART_REPORT_DEFAULT_LIMIT },
    })

    expect(
      AdminListChartReportsInputSchema.parse({
        headers: {},
        query: {
          state: 'closed',
          chartId: chart.chartId,
          fieldKey: queueRow.fieldKey,
          category: queueRow.category,
          reporterUserId: reporter.userId,
          submittedAtFromInclusive: '2026-08-01T00:00:00Z',
          submittedAtBeforeExclusive: '2026-09-01T00:00:00Z',
          publicationRevision: publication.revision,
          cursor: 'opaque_cursor_1',
          limit: '100',
        },
      }).query,
    ).toEqual({
      state: 'closed',
      chartId: chart.chartId,
      fieldKey: queueRow.fieldKey,
      category: queueRow.category,
      reporterUserId: reporter.userId,
      submittedAtFromInclusive: '2026-08-01T00:00:00.000Z',
      submittedAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      publicationRevision: publication.revision,
      cursor: 'opaque_cursor_1',
      limit: ADMIN_CHART_REPORT_MAX_LIMIT,
    })

    for (const query of [
      { state: 'pending' },
      { chartId: 'legacy-chart' },
      { fieldKey: 'chart.unknown' },
      { category: 'spam' },
      { reporterUserId: ' surrounding-space ' },
      { publicationRevision: '0' },
      { cursor: 'not.a.cursor' },
      { cursor: 'a'.repeat(1_025) },
      { limit: 0 },
      { limit: ADMIN_CHART_REPORT_MAX_LIMIT + 1 },
      { unknownFilter: 'not-allowed' },
      {
        submittedAtFromInclusive: '2026-09-01T00:00:00Z',
        submittedAtBeforeExclusive: '2026-08-01T00:00:00Z',
      },
      {
        submittedAtFromInclusive: '2026-08-01T00:00:00Z',
        submittedAtBeforeExclusive: '2026-08-01T00:00:00Z',
      },
    ]) {
      expect(AdminListChartReportsInputSchema.safeParse({ headers: {}, query }).success).toBe(false)
    }
  })

  it('returns compact strict rows, normalized filters, and independent identical reports', () => {
    const output = {
      items: [queueRow, { ...queueRow, id: '223e4567-e89b-42d3-a456-426614174000' }],
      nextCursor: 'next_open_first_page',
      normalizedFilters,
    }
    expect(AdminListChartReportsOutputSchema.parse(output)).toEqual(output)
    expect(AdminChartReportQueueRowSchema.safeParse(queueRow).success).toBe(true)

    for (const prohibitedField of [
      { sessionToken: 'secret' },
      { oauthProvider: 'google' },
      { ipAddress: '192.0.2.1' },
      { userAgent: 'private' },
      { rawSourceArtifact: '<html>not queue data</html>' },
      { internalNote: 'detail-only state' },
    ]) {
      expect(
        AdminListChartReportsOutputSchema.safeParse({
          ...output,
          items: [{ ...queueRow, ...prohibitedField }],
        }).success,
      ).toBe(false)
    }
    expect(
      AdminListChartReportsOutputSchema.safeParse({
        ...output,
        items: [{ ...queueRow, reporter: { ...reporter, email: 'reporter@example.com' } }],
      }).success,
    ).toBe(false)
    expect(
      AdminListChartReportsOutputSchema.safeParse({
        ...output,
        items: [{ ...queueRow, explanationPreview: 'x'.repeat(ADMIN_CHART_REPORT_PREVIEW_MAX_LENGTH + 1) }],
      }).success,
    ).toBe(false)
    expect(AdminListChartReportsOutputSchema.safeParse({ ...output, normalizedFilters: {} }).success).toBe(false)
  })

  it('distinguishes immutable captured evidence from drifted and retired active contexts', () => {
    const driftedPublication = {
      ...publication,
      catalogRunId: '82',
      revision: '145',
      fingerprintSha256: 'b'.repeat(64),
    }
    const currentOutput = {
      reporter,
      report: openReport,
      currentContext: {
        availability: 'current' as const,
        publication: driftedPublication,
        chart: { ...chart, songLabel: 'Updated label' },
        currentValue: 14.9,
      },
    }
    expect(AdminGetChartReportDetailOutputSchema.parse(currentOutput)).toEqual(currentOutput)

    const retiredOutput = {
      ...currentOutput,
      currentContext: {
        availability: 'retired' as const,
        publication: driftedPublication,
        songId: chart.songId,
        chartId: chart.chartId,
      },
    }
    expect(AdminGetChartReportDetailOutputSchema.parse(retiredOutput)).toEqual(retiredOutput)
    expect(
      AdminGetChartReportDetailOutputSchema.safeParse({
        ...currentOutput,
        currentContext: { ...currentOutput.currentContext, chart: { ...chart, chartId: 'dsht_abcdefghjk' } },
      }).success,
    ).toBe(false)
    expect(
      AdminGetChartReportDetailOutputSchema.safeParse({
        ...retiredOutput,
        currentContext: { ...retiredOutput.currentContext, chartId: 'dsht_abcdefghjk' },
      }).success,
    ).toBe(false)

    for (const prohibitedField of [
      { turnstileToken: 'secret' },
      { reporterIpAddress: '192.0.2.2' },
      { authAccounts: [{ provider: 'google' }] },
      { rawSourceArtifact: 'not persisted' },
    ]) {
      expect(
        AdminGetChartReportDetailOutputSchema.safeParse({
          ...currentOutput,
          report: { ...openReport, ...prohibitedField },
        }).success,
      ).toBe(false)
    }

    expect(
      AdminGetChartReportDetailInputSchema.parse({ headers: {}, params: { reportId: queueRow.id.toUpperCase() } }),
    ).toEqual({ headers: {}, params: { reportId: queueRow.id } })
    expect(
      AdminGetChartReportDetailInputSchema.safeParse({
        headers: {},
        params: { reportId: 'not-a-uuid', extra: true },
      }).success,
    ).toBe(false)
    for (const sourceUrl of ['ftp://example.com/evidence', 'definitely not a URL']) {
      expect(
        AdminGetChartReportDetailOutputSchema.safeParse({
          ...currentOutput,
          report: { ...openReport, sourceUrls: [sourceUrl] },
        }).success,
      ).toBe(false)
    }
  })

  it('enforces the two-state lifecycle and immutable closure metadata', () => {
    const closure = {
      actorUserId: 'administrator-user',
      closedAt: '2026-08-24T11:00:00.000Z',
      internalNote: 'Reviewed against the active official source.',
    }
    const closedReport = { ...openReport, state: 'closed' as const, closure }
    expect(AdminChartReportDetailSchema.parse(closedReport)).toEqual(closedReport)
    expect(AdminChartReportDetailSchema.safeParse({ ...openReport, closure }).success).toBe(false)
    expect(AdminChartReportDetailSchema.safeParse({ ...closedReport, closure: null }).success).toBe(false)
    expect(AdminChartReportDetailSchema.safeParse({ ...openReport, state: 'assigned' }).success).toBe(false)

    expect(
      AdminCloseChartReportInputSchema.parse({
        headers: {},
        params: { reportId: queueRow.id },
        body: { expectedState: 'open' },
      }),
    ).toEqual({
      headers: {},
      params: { reportId: queueRow.id },
      body: { expectedState: 'open', internalNote: null },
    })
    expect(
      AdminCloseChartReportInputSchema.parse({
        headers: {},
        params: { reportId: queueRow.id },
        body: { expectedState: 'open', internalNote: '  bounded note  ' },
      }).body.internalNote,
    ).toBe('bounded note')

    for (const body of [
      {},
      { expectedState: 'closed' },
      { expectedState: 'open', internalNote: '' },
      { expectedState: 'open', internalNote: 'x'.repeat(ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH + 1) },
      { expectedState: 'open', confirmed: true },
    ]) {
      expect(
        AdminCloseChartReportInputSchema.safeParse({
          headers: {},
          params: { reportId: queueRow.id },
          body,
        }).success,
      ).toBe(false)
    }

    const closeOutput = { id: queueRow.id, state: 'closed' as const, closure }
    expect(AdminCloseChartReportOutputSchema.parse(closeOutput)).toEqual(closeOutput)
    expect(AdminCloseChartReportOutputSchema.safeParse({ ...closeOutput, reopenedAt: null }).success).toBe(false)
    expect(Object.keys(adminContract.closeChartReport['~orpc'].errorMap)).toContain('CONFLICT')
  })
})