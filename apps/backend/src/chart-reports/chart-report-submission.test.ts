import { describe, expect, it, vi } from 'vitest'
import { normalizeStoredChartReport, type NewChartReport } from './chart-report-domain.js'
import {
  ChartReportCatalogFailure,
  type ChartReportCatalogResolver,
  type ResolvedActiveChartReportField,
} from './chart-report-catalog.js'
import { createChartReportSubmissionService, ChartReportSubmissionFailure } from './chart-report-submission.js'
import type { ChartReportService } from './chart-report-service.js'
import type { ChartReportTurnstileVerifier } from './chart-report-turnstile.js'

const REPORT_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'
const CREATED_AT = new Date('2026-08-24T12:00:00.000Z')
const resolved = {
  chart: { stableSongId: 'dsng_23456789ab', stableChartId: 'dsht_abcdefghjk' },
  publication: {
    channel: 'production-v1',
    catalogRunId: '71',
    revision: '23',
    fingerprintSha256: 'a'.repeat(64),
  },
  currentValue: '14+',
} satisfies ResolvedActiveChartReportField

const input = (overrides: Record<string, unknown> = {}) => ({
  songId: resolved.chart.stableSongId,
  chartId: resolved.chart.stableChartId,
  fieldKey: 'chart.level',
  category: 'incorrect_value',
  publicationRevision: resolved.publication.revision,
  currentValue: resolved.currentValue,
  proposedValue: '15',
  explanation: 'The current game release displays level 15.',
  sourceUrls: ['HTTPS://Example.COM:443/evidence/../chart'],
  turnstileToken: 'opaque-challenge-token',
  ...overrides,
})

const createHarness = ({
  active = resolved,
  catalogFailure,
  verification = { ok: true } as const,
}: {
  readonly active?: ResolvedActiveChartReportField
  readonly catalogFailure?: ChartReportCatalogFailure
  readonly verification?: Awaited<ReturnType<ChartReportTurnstileVerifier['verify']>>
} = {}) => {
  const sequence: string[] = []
  const createReport = vi.fn(async (report: Omit<NewChartReport, 'id'>) => {
    sequence.push('persist')
    return normalizeStoredChartReport({
      ...report,
      id: REPORT_ID,
      state: 'open',
      closure: null,
      createdAt: CREATED_AT,
    })
  })
  const reports = { createReport } as Pick<ChartReportService, 'createReport'>
  const catalog: ChartReportCatalogResolver = {
    resolveActiveField: vi.fn(async () => {
      sequence.push('catalog')
      if (catalogFailure) throw catalogFailure
      return active
    }),
  }
  const turnstile: ChartReportTurnstileVerifier = {
    verify: vi.fn(async () => {
      sequence.push('turnstile')
      return verification
    }),
  }
  return {
    service: createChartReportSubmissionService({ catalog, reports, turnstile }),
    catalog,
    createReport,
    turnstile,
    sequence,
  }
}

const expectFailure = async (promise: Promise<unknown>, code: ChartReportSubmissionFailure['code']) => {
  await expect(promise).rejects.toMatchObject({ name: 'ChartReportSubmissionFailure', code })
}

describe('public chart-report submission service', () => {
  it('verifies once, resolves the active immutable value, and persists only server-authoritative identity', async () => {
    const harness = createHarness()
    await expect(harness.service.create('reporter-user', input())).resolves.toEqual({
      id: REPORT_ID,
      state: 'open',
      createdAt: CREATED_AT.toISOString(),
    })
    expect(harness.sequence).toEqual(['turnstile', 'catalog', 'persist'])
    expect(harness.turnstile.verify).toHaveBeenCalledWith('opaque-challenge-token')
    expect(harness.createReport).toHaveBeenCalledWith({
      reporterUserId: 'reporter-user',
      chart: resolved.chart,
      publication: resolved.publication,
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      currentValue: '14+',
      proposedValue: '15',
      explanation: 'The current game release displays level 15.',
      sourceUrls: ['https://example.com/chart'],
    })
    expect(JSON.stringify(harness.createReport.mock.calls)).not.toContain('opaque-challenge-token')
  })

  it('returns a safe stale conflict for either revision or exact current-value drift', async () => {
    for (const changed of [input({ publicationRevision: '22' }), input({ currentValue: '14' })]) {
      const harness = createHarness()
      await expectFailure(harness.service.create('reporter-user', changed), 'STALE_PUBLICATION')
      await expect(harness.service.create('reporter-user', changed)).rejects.toMatchObject({
        activePublicationRevision: '23',
      })
      expect(harness.createReport).not.toHaveBeenCalled()
    }
  })

  it('rejects invalid values and reserved evidence hosts before spending the challenge', async () => {
    for (const changed of [
      input({ proposedValue: 15 }),
      input({ sourceUrls: ['http://127.1/evidence'] }),
      input({ publicationRevision: '01' }),
    ]) {
      const harness = createHarness()
      await expectFailure(harness.service.create('reporter-user', changed), 'VALIDATION_FAILED')
      expect(harness.turnstile.verify).not.toHaveBeenCalled()
      expect(harness.catalog.resolveActiveField).not.toHaveBeenCalled()
    }
  })

  it('distinguishes rejected challenges from temporary verifier failures without persisting either', async () => {
    for (const [category, code] of [
      ['REJECTED', 'TURNSTILE_REJECTED'],
      ['UNAVAILABLE', 'TURNSTILE_UNAVAILABLE'],
    ] as const) {
      const harness = createHarness({ verification: { ok: false, category } })
      await expectFailure(harness.service.create('reporter-user', input()), code)
      expect(harness.catalog.resolveActiveField).not.toHaveBeenCalled()
      expect(harness.createReport).not.toHaveBeenCalled()
    }
  })

  it('maps a removed chart to stale and a broken publication to unavailable', async () => {
    const missing = createHarness({
      catalogFailure: new ChartReportCatalogFailure('CHART_NOT_FOUND', '24'),
    })
    await expectFailure(missing.service.create('reporter-user', input()), 'STALE_PUBLICATION')

    const unavailable = createHarness({
      catalogFailure: new ChartReportCatalogFailure('CATALOG_UNAVAILABLE'),
    })
    await expectFailure(unavailable.service.create('reporter-user', input()), 'CATALOG_UNAVAILABLE')
    expect(unavailable.createReport).not.toHaveBeenCalled()
  })
})