import { describe, expect, it } from 'vitest'
import { normalizeStoredChartReport, type NewChartReport, type StoredChartReport } from './chart-report-domain.js'
import type { ChartReportRepository, CloseOpenChartReport } from './chart-report-repository.js'
import {
  ChartReportServiceFailure,
  createChartReportService,
  type CreateChartReportInput,
} from './chart-report-service.js'

const FIRST_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'
const SECOND_ID = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd2'
const CREATED_AT = new Date('2026-08-24T12:00:00.000Z')
const CLOSED_AT = new Date('2026-08-24T12:01:00.000Z')

const submission = (overrides: Partial<CreateChartReportInput> = {}): CreateChartReportInput => ({
  reporterUserId: 'reporter-user',
  chart: { stableSongId: 'dsng_23456789ab', stableChartId: 'dsht_abcdefghjk' },
  publication: {
    channel: 'production-v1',
    catalogRunId: '71',
    revision: '23',
    fingerprintSha256: 'a'.repeat(64),
  },
  fieldKey: 'chart.level',
  category: 'incorrect_value',
  currentValue: '14',
  proposedValue: '14+',
  explanation: 'The game displays 14+.',
  sourceUrls: ['https://example.com/evidence'],
  ...overrides,
})

class MemoryChartReportRepository implements ChartReportRepository {
  readonly createCalls: NewChartReport[] = []
  readonly closeCalls: CloseOpenChartReport[] = []
  readonly reports = new Map<string, StoredChartReport>()

  async create(report: NewChartReport): Promise<StoredChartReport> {
    this.createCalls.push(report)
    if (this.reports.has(report.id)) throw new Error('test ID collision')
    const stored = normalizeStoredChartReport({
      ...report,
      createdAt: CREATED_AT,
      state: 'open',
      closure: null,
    })
    this.reports.set(report.id, stored)
    return stored
  }

  async findById(reportId: string): Promise<StoredChartReport | undefined> {
    return this.reports.get(reportId)
  }

  async closeOpen(input: CloseOpenChartReport): Promise<StoredChartReport | undefined> {
    this.closeCalls.push(input)
    const existing = this.reports.get(input.reportId)
    if (!existing || existing.state !== 'open') return undefined
    const closed = normalizeStoredChartReport({
      ...existing,
      state: 'closed',
      closure: {
        actorUserId: input.actorUserId,
        closedAt: CLOSED_AT,
        internalNote: input.internalNote,
      },
    })
    this.reports.set(input.reportId, closed)
    return closed
  }
}

const idGenerator = (...ids: string[]) => {
  let offset = 0
  return () =>
    ids[offset++] ??
    (() => {
      throw new Error('No test report ID remains')
    })()
}

const expectServiceFailure = async (operation: Promise<unknown>, code: ChartReportServiceFailure['code']) => {
  await expect(operation).rejects.toMatchObject({
    name: 'ChartReportServiceFailure',
    code,
  })
}

describe('chart report service submission', () => {
  it('creates independent records for identical submissions without semantic deduplication', async () => {
    const repository = new MemoryChartReportRepository()
    const service = createChartReportService({
      repository,
      generateReportId: idGenerator(FIRST_ID, SECOND_ID),
    })

    const first = await service.createReport(submission())
    const second = await service.createReport(submission())

    expect(first.id).toBe(FIRST_ID)
    expect(second.id).toBe(SECOND_ID)
    expect(repository.createCalls).toHaveLength(2)
    expect(repository.reports).toHaveLength(2)
    expect({ ...first, id: undefined }).toEqual({ ...second, id: undefined })
  })

  it('normalizes and copies all content before crossing the persistence boundary', async () => {
    const repository = new MemoryChartReportRepository()
    const service = createChartReportService({
      repository,
      generateReportId: () => FIRST_ID,
    })
    const currentValue = { CiRCLE: 14.7, BUDDiES: 14.5 }
    const sourceUrls = ['HTTPS://Example.COM:443/evidence/../chart']

    const created = await service.createReport(
      submission({
        fieldKey: 'chart.multiver_internal_levels',
        currentValue,
        proposedValue: { CiRCLE: 14.8, BUDDiES: 14.5 },
        explanation: '  Checked both versions.  ',
        sourceUrls,
      }),
    )
    currentValue.CiRCLE = 1
    sourceUrls[0] = 'https://attacker.example/replaced'

    expect(created.currentValue).toEqual({ BUDDiES: 14.5, CiRCLE: 14.7 })
    expect(created.explanation).toBe('Checked both versions.')
    expect(created.sourceUrls).toEqual(['https://example.com/chart'])
    expect(Object.isFrozen(repository.createCalls[0])).toBe(true)
  })

  it('maps domain validation failures to one typed, detail-free service failure', async () => {
    const repository = new MemoryChartReportRepository()
    const service = createChartReportService({
      repository,
      generateReportId: () => FIRST_ID,
    })

    await expectServiceFailure(
      service.createReport(
        submission({
          publication: {
            ...(submission().publication as object),
            revision: '0',
          },
        }),
      ),
      'VALIDATION_FAILED',
    )
    await expectServiceFailure(
      service.createReport(
        submission({
          fieldKey: 'chart.unsupported',
          currentValue: 'private-value',
        }),
      ),
      'VALIDATION_FAILED',
    )
    await expectServiceFailure(
      service.createReport(submission({ sourceUrls: ['https://user:credential@example.com/'] })),
      'VALIDATION_FAILED',
    )
    expect(repository.createCalls).toHaveLength(0)
  })

  it('loads by validated opaque ID and distinguishes missing reports', async () => {
    const repository = new MemoryChartReportRepository()
    const service = createChartReportService({
      repository,
      generateReportId: idGenerator(FIRST_ID),
    })
    await service.createReport(submission())

    await expect(service.getReport(FIRST_ID.toUpperCase())).resolves.toMatchObject({ id: FIRST_ID })
    await expectServiceFailure(service.getReport(SECOND_ID), 'NOT_FOUND')
    await expectServiceFailure(service.getReport('not-an-id'), 'VALIDATION_FAILED')
  })
})

describe('chart report service closure', () => {
  it('performs the only open-to-closed transition and preserves its first closure metadata', async () => {
    const repository = new MemoryChartReportRepository()
    const service = createChartReportService({
      repository,
      generateReportId: idGenerator(FIRST_ID),
    })
    await service.createReport(submission())

    const first = await service.closeReport({
      reportId: FIRST_ID,
      actorUserId: 'admin-user',
      expectedState: 'open',
      internalNote: '  Fixed in source.  ',
    })
    expect(first).toMatchObject({
      applied: true,
      report: {
        state: 'closed',
        closure: {
          actorUserId: 'admin-user',
          closedAt: CLOSED_AT,
          internalNote: 'Fixed in source.',
        },
      },
    })

    const exactRetry = await service.closeReport({
      reportId: FIRST_ID,
      actorUserId: 'admin-user',
      expectedState: 'open',
      internalNote: 'Fixed in source.',
    })
    expect(exactRetry).toEqual({ report: first.report, applied: false })

    await expectServiceFailure(
      service.closeReport({
        reportId: FIRST_ID,
        actorUserId: 'another-admin',
        expectedState: 'open',
        internalNote: 'Attempted overwrite.',
      }),
      'CONFLICT',
    )
    expect((await service.getReport(FIRST_ID)).closure).toEqual(first.report.closure)
  })

  it('lets only one concurrent close win the repository compare-and-set', async () => {
    const repository = new MemoryChartReportRepository()
    const service = createChartReportService({
      repository,
      generateReportId: idGenerator(FIRST_ID),
    })
    await service.createReport(submission())

    const results = await Promise.allSettled([
      service.closeReport({
        reportId: FIRST_ID,
        actorUserId: 'admin-a',
        expectedState: 'open',
        internalNote: null,
      }),
      service.closeReport({
        reportId: FIRST_ID,
        actorUserId: 'admin-b',
        expectedState: 'open',
        internalNote: null,
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await service.getReport(FIRST_ID)).closure?.actorUserId).toBe('admin-a')
  })

  it('rejects nonexistent reports and every attempted non-open transition', async () => {
    const repository = new MemoryChartReportRepository()
    const service = createChartReportService({
      repository,
      generateReportId: idGenerator(FIRST_ID),
    })

    await expectServiceFailure(
      service.closeReport({
        reportId: FIRST_ID,
        actorUserId: 'admin-user',
        expectedState: 'open',
      }),
      'NOT_FOUND',
    )
    await service.createReport(submission())
    await expectServiceFailure(
      service.closeReport({
        reportId: FIRST_ID,
        actorUserId: 'admin-user',
        expectedState: 'closed',
      }),
      'VALIDATION_FAILED',
    )
    expect(repository.closeCalls).toHaveLength(1)
  })

  it('exposes no repository operation that can edit, delete, merge, assign, or reopen content', () => {
    const repository = new MemoryChartReportRepository()
    expect(Object.keys(repository).sort()).toEqual(['closeCalls', 'createCalls', 'reports'])
    expect(typeof repository.create).toBe('function')
    expect(typeof repository.findById).toBe('function')
    expect(typeof repository.closeOpen).toBe('function')
    expect(repository).not.toHaveProperty('update')
    expect(repository).not.toHaveProperty('delete')
    expect(repository).not.toHaveProperty('reopen')
    expect(repository).not.toHaveProperty('merge')
  })
})