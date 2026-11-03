/**
 * Writes the language-neutral test vectors of cloud-save scores (`*.json` next to this file).
 *
 * Expectations are spelled out here from the design (meta#17 §4.7, §5.3, §5.4) without importing the
 * implementation, so the vectors check it instead of echoing it. Run `pnpm --filter @gekichumai/maimai-domain
 * vectors` after changing a rule; a test fails while the checked-in JSON is stale.
 */
import { writeFileSync } from 'node:fs'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Obj = { [key: string]: Json }

const VERSION = 1

// ---------------------------------------------------------------------------------------------------------------
// achievement.json

function achievementVectors(): Obj {
  const toInt: Obj[] = [
    { input: '100.5432%', expected: 1005432, note: 'maimai NET display string' },
    { input: '100.5432', expected: 1005432 },
    { input: ' 100.5432 % ', expected: 1005432, note: 'surrounding whitespace' },
    { input: '99.9999%', expected: 999999 },
    { input: '101.0000%', expected: 1010000, note: 'maximum' },
    { input: '80.0000%', expected: 800000 },
    { input: '0.0001%', expected: 1, note: 'smallest step' },
    { input: '0.0000%', expected: 0 },
    { input: '0', expected: 0 },
    { input: '97.12345', expected: 971234, note: 'tie, round half to even (4 is even)' },
    { input: '97.12355', expected: 971236, note: 'tie, round half to even (5 is odd)' },
    { input: '97.123450001', expected: 971235, note: 'above the tie' },
    { input: '97.12344999', expected: 971234, note: 'below the tie' },
    { input: '100.54320000', expected: 1005432, note: 'trailing zeros' },
    { input: '100', expected: 1000000 },
    { input: '100.', expected: 1000000 },
    { input: '.5', expected: 5000 },
    { input: '+100.5', expected: 1005000 },
    { input: '1.005432e2', expected: 1005432, note: 'exponent form' },
    { input: '1e-7', expected: 0 },
    { input: '0.00005', expected: 0, note: 'tie at zero rounds to even 0' },
    { input: '0.00015', expected: 2, note: 'tie rounds to even 2' },
    { input: '100.99995', expected: 1010000, note: 'tie rounds to even 1010000' },
    { input: '101.00005', expected: 1010000, note: 'tie rounds down to even 1010000' },
    { input: '101.00006', expected: null, note: 'above maximum' },
    { input: '101.0001', expected: null, note: 'above maximum' },
    { input: '1000', expected: null, note: 'above maximum' },
    { input: '-0.0001', expected: null, note: 'negative' },
    { input: '-0', expected: null, note: 'any sign other than + is rejected' },
    { input: '', expected: null },
    { input: '%', expected: null },
    { input: '.', expected: null },
    { input: 'abc', expected: null },
    { input: '100,5432', expected: null, note: 'decimal comma' },
    { input: '1.2.3', expected: null },
    { input: 'NaN', expected: null },
    { input: 'Infinity', expected: null },
    { input: '100.5432%%', expected: null },
    { input: 100.5432, expected: 1005432 },
    { input: 99.9999, expected: 999999 },
    { input: 101, expected: 1010000 },
    { input: 101.0, expected: 1010000 },
    { input: 80, expected: 800000 },
    { input: 0.0001, expected: 1 },
    { input: 0, expected: 0 },
    { input: 97.12345, expected: 971234, note: 'float, shortest decimal "97.12345", then round half to even' },
    { input: 97.12355, expected: 971236 },
    { input: 100.123456, expected: 1001235 },
    { input: 1e-7, expected: 0, note: 'shortest decimal is in exponent form' },
    { input: 0.00015, expected: 2 },
    { input: 101.0001, expected: null },
    { input: -1, expected: null },
    { input: 1e21, expected: null },
  ]

  const fromInt: Obj[] = [
    { input: 1005432, percent: 100.5432, formatted: '100.5432' },
    { input: 999999, percent: 99.9999, formatted: '99.9999' },
    { input: 1010000, percent: 101, formatted: '101.0000' },
    { input: 800000, percent: 80, formatted: '80.0000' },
    { input: 1, percent: 0.0001, formatted: '0.0001' },
    { input: 0, percent: 0, formatted: '0.0000' },
    { input: 971234, percent: 97.1234, formatted: '97.1234' },
  ]

  return {
    $comment:
      'Achievement integers (1/10000 %). toAchievementInt: string inputs are exact decimals (optional trailing %, surrounding whitespace, optional +, optional exponent); number inputs go through their shortest round-trip decimal string. Round half to even; expected null = invalid or outside 0..1010000 (never clamped). fromAchievementInt: input / 10000; formatted has exactly four fraction digits. Every integer n in 0..1010000 must also satisfy toAchievementInt(fromAchievementInt(n)) == n.',
    version: VERSION,
    toAchievementInt: toInt,
    fromAchievementInt: fromInt,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// score-merge.json

const SHA = (char: string) => char.repeat(64)
const JOB_STARTED_AT = '2026-11-03T12:00:00.000Z'

const VALUE = { achievement: 1005000, comboFlag: 'fc', syncFlag: 'fs' } as const
const ACHIEVEMENT = { better: 1005432, equal: 1005000, worse: 1004000 } as const
type Comparison = keyof typeof ACHIEVEMENT

function provenance(fields: Obj): Obj {
  return {
    source: null,
    claimedSource: null,
    fetchedBy: null,
    verification: null,
    entryMethod: null,
    sourceAccountId: null,
    importJobId: null,
    rawPayloadSha256: null,
    fetchedAt: null,
    editedFromJobId: null,
    ...fields,
  }
}

const EXISTING_PROVENANCE: Record<string, Obj> = {
  verified: provenance({
    source: 'lxns',
    fetchedBy: 'server',
    verification: 'verified',
    entryMethod: 'import',
    sourceAccountId: 'lxns-friend-code',
    importJobId: 'dimp_prev_lxns',
    rawPayloadSha256: SHA('c'),
    fetchedAt: '2026-11-01T00:00:00.000Z',
  }),
  verifiedNet: provenance({
    source: 'maimai-net-jp',
    fetchedBy: 'server',
    verification: 'verified',
    entryMethod: 'import',
    sourceAccountId: '123456789012345',
    importJobId: 'dimp_prev_net',
    rawPayloadSha256: SHA('e'),
    fetchedAt: '2026-11-01T00:00:00.000Z',
  }),
  client_reported: provenance({
    source: 'dxrating-json',
    claimedSource: 'lxns',
    fetchedBy: 'client',
    verification: 'client_reported',
    entryMethod: 'file',
    importJobId: 'dimp_prev_json',
    rawPayloadSha256: SHA('d'),
    fetchedAt: '2026-10-30T00:00:00.000Z',
  }),
  manual: provenance({ source: 'manual', fetchedBy: 'client', verification: 'client_reported', entryMethod: 'keypad' }),
  user_edited: provenance({
    source: 'manual',
    fetchedBy: 'client',
    verification: 'user_edited',
    entryMethod: 'typed',
    editedFromJobId: 'dimp_prev_lxns',
  }),
}

function existingRecord(kind: keyof typeof EXISTING_PROVENANCE, overrides: Obj = {}): Obj {
  const isManual = kind === 'manual' || kind === 'user_edited'
  return {
    ...VALUE,
    dxScore: isManual ? null : 2400,
    best50Bucket: null,
    providerRecordId: isManual ? null : '42',
    provenance: EXISTING_PROVENANCE[kind]!,
    revision: 10,
    deletedAt: null,
    ...overrides,
  }
}

function serverJob(trigger: string, overrides: Obj = {}): Obj {
  return {
    id: 'dimp_server',
    source: 'maimai-net-jp',
    fetchedBy: 'server',
    trigger,
    startedAt: JOB_STARTED_AT,
    fetchedAt: '2026-11-03T12:00:05.000Z',
    rawPayloadSha256: SHA('a'),
    sourceAccountId: '123456789012345',
    ...overrides,
  }
}

function clientJob(trigger: string, overrides: Obj = {}): Obj {
  return {
    id: 'dimp_client',
    source: trigger === 'migration' ? 'legacy-local' : 'aqua-dx',
    fetchedBy: 'client',
    trigger,
    startedAt: JOB_STARTED_AT,
    fetchedAt: '2026-11-02T08:00:00.000Z',
    rawPayloadSha256: SHA('b'),
    sourceAccountId: 'claimed-account',
    ...overrides,
  }
}

function incomingRecord(comparison: Comparison, overrides: Obj = {}): Obj {
  return {
    ...VALUE,
    achievement: ACHIEVEMENT[comparison],
    dxScore: 2410,
    best50Bucket: null,
    providerRecordId: '43',
    claimedSource: 'lxns',
    ...overrides,
  }
}

/** Provenance written by an import job, per §4.5 */
function jobProvenance(job: Obj, incoming: Obj): Obj {
  const server = job.fetchedBy === 'server'
  const migration = job.trigger === 'migration' || job.source === 'legacy-local'
  return provenance({
    source: job.source!,
    claimedSource: server ? null : (incoming.claimedSource ?? null),
    fetchedBy: job.fetchedBy!,
    verification: server ? 'verified' : 'client_reported',
    entryMethod: migration ? 'migration' : server ? 'import' : 'file',
    sourceAccountId: job.sourceAccountId ?? null,
    importJobId: job.id!,
    rawPayloadSha256: job.rawPayloadSha256 ?? null,
    fetchedAt: job.fetchedAt ?? null,
  })
}

function replacement(job: Obj, incoming: Obj): Obj {
  return {
    achievement: incoming.achievement!,
    comboFlag: incoming.comboFlag ?? null,
    syncFlag: incoming.syncFlag ?? null,
    dxScore: incoming.dxScore ?? null,
    best50Bucket: incoming.best50Bucket ?? null,
    providerRecordId: incoming.providerRecordId ?? null,
    provenance: jobProvenance(job, incoming),
    deleted: false,
  }
}

function asNext(existing: Obj, overrides: Obj = {}): Obj {
  const { revision: _revision, deletedAt, ...fields } = existing
  return { ...fields, deleted: deletedAt !== null, ...overrides }
}

/** An equal-score verification upgrade: provenance and dxScore / bucket / providerRecordId all come from the job */
function upgradedFrom(existing: Obj, job: Obj, incoming: Obj, overrides: Obj = {}): Obj {
  return asNext(existing, {
    dxScore: incoming.dxScore ?? null,
    best50Bucket: incoming.best50Bucket ?? null,
    providerRecordId: incoming.providerRecordId ?? null,
    provenance: jobProvenance(job, incoming),
    ...overrides,
  })
}

const APPLIED = { bumpRevision: true, valueChanged: true, eventKind: 'import_applied' }
const NOTHING = { next: null, bumpRevision: false, valueChanged: false, liveDelta: 0, eventKind: null }

function expectImport(outcome: string, rest: Obj): Obj {
  return { outcome, countKey: outcome === 'revived' ? 'inserted' : outcome, ...rest }
}

function inserted(job: Obj, incoming: Obj, outcome: 'inserted' | 'revived'): Obj {
  return expectImport(outcome, { next: replacement(job, incoming), ...APPLIED, liveDelta: 1 })
}

function improved(job: Obj, incoming: Obj): Obj {
  return expectImport('improved', { next: replacement(job, incoming), ...APPLIED, liveDelta: 0 })
}

function untouched(outcome: string): Obj {
  return expectImport(outcome, NOTHING)
}

function provenanceUpgraded(next: Obj): Obj {
  return expectImport('provenanceUpgraded', {
    next,
    bumpRevision: true,
    valueChanged: false,
    liveDelta: 0,
    eventKind: 'provenance_upgraded',
  })
}

function compareVectors(): Obj[] {
  const score = (achievement: number, comboFlag: string | null, syncFlag: string | null): Obj => ({
    achievement,
    comboFlag,
    syncFlag,
  })
  const cases: Obj[] = [
    {
      name: 'higher achievement wins over flags',
      a: score(1005001, null, null),
      b: score(1005000, 'app', 'fsdp'),
      expected: 1,
    },
    { name: 'lower achievement loses', a: score(999999, 'app', 'fsdp'), b: score(1000000, null, null), expected: -1 },
    { name: 'identical', a: score(1005000, 'fc', 'fs'), b: score(1005000, 'fc', 'fs'), expected: 0 },
    { name: 'identical without flags', a: score(0, null, null), b: score(0, null, null), expected: 0 },
  ]
  const combos = [null, 'fc', 'fcp', 'ap', 'app']
  for (let i = 1; i < combos.length; i++) {
    cases.push({
      name: `combo ${combos[i]} beats ${combos[i - 1] ?? 'none'}`,
      a: score(1000000, combos[i]!, null),
      b: score(1000000, combos[i - 1]!, 'fsdp'),
      expected: 1,
    })
  }
  const syncs = [null, 'sync', 'fs', 'fsp', 'fsd', 'fsdp']
  for (let i = 1; i < syncs.length; i++) {
    cases.push({
      name: `sync ${syncs[i]} beats ${syncs[i - 1] ?? 'none'}`,
      a: score(1000000, 'ap', syncs[i]!),
      b: score(1000000, 'ap', syncs[i - 1]!),
      expected: 1,
    })
    cases.push({
      name: `sync ${syncs[i - 1] ?? 'none'} loses to ${syncs[i]}`,
      a: score(1000000, 'ap', syncs[i - 1]!),
      b: score(1000000, 'ap', syncs[i]!),
      expected: -1,
    })
  }
  return cases
}

function importMergeVectors(): Obj[] {
  const cases: Obj[] = []
  const add = (name: string, existing: Obj | null, incoming: Obj, job: Obj, expected: Obj) =>
    cases.push({ name, existing, incoming, job, expected })

  const triggers = ['user', 'auto', 'migration'] as const
  const jobs = { server: serverJob, client: clientJob } as const
  const comparisons: Comparison[] = ['better', 'equal', 'worse']

  // No stored record: always insert
  for (const [jobKind, makeJob] of Object.entries(jobs)) {
    for (const trigger of triggers) {
      const job = makeJob(trigger)
      const incoming = incomingRecord('equal')
      add(
        `no record / ${jobKind} job / trigger ${trigger} → inserted`,
        null,
        incoming,
        job,
        inserted(job, incoming, 'inserted'),
      )
    }
  }

  // The §13 matrix: comparison × stored verification or tombstone × job kind × trigger
  const storedKinds = ['verified', 'client_reported', 'user_edited', 'tombstone'] as const
  for (const comparison of comparisons) {
    for (const stored of storedKinds) {
      for (const [jobKind, makeJob] of Object.entries(jobs)) {
        for (const trigger of triggers) {
          const job = makeJob(trigger)
          const incoming = incomingRecord(comparison)
          const existing =
            stored === 'tombstone'
              ? existingRecord('verified', { deletedAt: '2026-11-02T00:00:00.000Z' })
              : existingRecord(stored)

          let expected: Obj
          if (stored === 'tombstone') {
            // Deleted before the job started: revive only if strictly better or the user started the import
            expected =
              comparison === 'better' || trigger === 'user'
                ? inserted(job, incoming, 'revived')
                : untouched('skippedDeleted')
          } else if (comparison === 'better') {
            expected = improved(job, incoming)
          } else if (stored === 'user_edited') {
            expected = untouched('keptUserEdit')
          } else if (comparison === 'equal' && stored === 'client_reported' && jobKind === 'server') {
            // The verified record takes every field from the server job, never the client's values
            expected = provenanceUpgraded(upgradedFrom(existing, job, incoming))
          } else {
            // Equal or worse with no verification gain; the stored dxScore / providerRecordId are already set
            expected = untouched('unchanged')
          }

          add(
            `${comparison} / stored ${stored} / ${jobKind} job / trigger ${trigger}`,
            existing,
            incoming,
            job,
            expected,
          )
        }
      }
    }
  }

  // Deletion stickiness: deleted while (or after) the job was running
  for (const trigger of triggers) {
    for (const deletedAt of ['2026-11-03T12:00:00.000Z', '2026-11-03T12:00:01.000Z']) {
      const job = serverJob(trigger)
      add(
        `tombstone deleted at ${deletedAt} (job started ${JOB_STARTED_AT}) / better / trigger ${trigger} → skippedDeleted`,
        existingRecord('verified', { deletedAt }),
        incomingRecord('better'),
        job,
        untouched('skippedDeleted'),
      )
    }
  }
  {
    const job = serverJob('auto')
    const incoming = incomingRecord('equal')
    add(
      'tombstone deleted 1 ms before the job started / equal / trigger auto → skippedDeleted',
      existingRecord('verified', { deletedAt: '2026-11-03T11:59:59.999+00:00' }),
      incoming,
      job,
      untouched('skippedDeleted'),
    )
  }
  {
    const job = clientJob('migration')
    const incoming = incomingRecord('equal', { comboFlag: 'fcp' })
    add(
      'tombstone / better by combo flag only / migration → revived',
      existingRecord('client_reported', { deletedAt: '2026-11-01T00:00:00.000Z' }),
      incoming,
      job,
      inserted(job, incoming, 'revived'),
    )
  }

  // Same-source verified: silent refresh of the job reference, no revision bump
  {
    const job = serverJob('auto')
    const existing = existingRecord('verifiedNet')
    const incoming = incomingRecord('equal')
    add(
      'equal / stored verified from the same source → unchanged, refresh job reference without bump',
      existing,
      incoming,
      job,
      expectImport('unchanged', {
        next: asNext(existing, {
          provenance: {
            ...EXISTING_PROVENANCE.verifiedNet!,
            importJobId: job.id!,
            fetchedAt: job.fetchedAt!,
            rawPayloadSha256: job.rawPayloadSha256!,
          },
        }),
        bumpRevision: false,
        valueChanged: false,
        liveDelta: 0,
        eventKind: null,
      }),
    )
    add(
      'worse / stored verified from the same source → unchanged, no refresh',
      existing,
      incomingRecord('worse'),
      job,
      untouched('unchanged'),
    )
    add(
      'equal / stored verified from the same source but a different account → unchanged, nothing written',
      existing,
      incoming,
      serverJob('user', { sourceAccountId: 'other-friend-code' }),
      untouched('unchanged'),
    )
    add(
      'equal / stored verified from the same source, job without account → unchanged, nothing written',
      existing,
      incoming,
      serverJob('user', { sourceAccountId: null }),
      untouched('unchanged'),
    )
  }

  // A verified record is only backfilled by a job of the same source and account, which refreshes it anyway
  {
    const missing = existingRecord('verifiedNet', { dxScore: null, providerRecordId: null })
    const incoming = incomingRecord('equal')
    const job = serverJob('auto')
    add(
      'equal / stored verified missing dxScore / same source and account → backfill and refresh without bump',
      missing,
      incoming,
      job,
      expectImport('unchanged', {
        next: asNext(missing, {
          dxScore: 2410,
          providerRecordId: '43',
          provenance: {
            ...EXISTING_PROVENANCE.verifiedNet!,
            importJobId: job.id!,
            fetchedAt: job.fetchedAt!,
            rawPayloadSha256: job.rawPayloadSha256!,
          },
        }),
        bumpRevision: false,
        valueChanged: false,
        liveDelta: 0,
        eventKind: null,
      }),
    )
    for (const trigger of triggers) {
      add(
        `equal / stored verified missing dxScore / client job / trigger ${trigger} → unchanged, nothing written`,
        missing,
        incomingRecord('equal', { dxScore: 9999, providerRecordId: 'forged' }),
        clientJob(trigger),
        untouched('unchanged'),
      )
    }
    add(
      'equal / stored verified missing dxScore / server job from another source → unchanged, nothing written',
      missing,
      incoming,
      serverJob('auto', { id: 'dimp_lxns', source: 'lxns', sourceAccountId: 'lxns-friend-code' }),
      untouched('unchanged'),
    )
    add(
      'equal / stored verified missing dxScore / same source, other account → unchanged, nothing written',
      missing,
      incoming,
      serverJob('auto', { sourceAccountId: 'other-friend-code' }),
      untouched('unchanged'),
    )
  }

  // A verification upgrade never keeps client-supplied values under the verified provenance
  {
    const forged = existingRecord('client_reported', { dxScore: 99999, providerRecordId: 'evil', best50Bucket: 'b15' })
    const job = serverJob('auto')
    const incoming = incomingRecord('equal', { dxScore: 2400, providerRecordId: '42' })
    add(
      'equal / stored client_reported with another dxScore / server job → provenanceUpgraded, server values win',
      forged,
      incoming,
      job,
      provenanceUpgraded(upgradedFrom(forged, job, incoming)),
    )
    const bare = incomingRecord('equal', { dxScore: null, providerRecordId: null })
    add(
      'equal / stored client_reported with dxScore / server job without dxScore → provenanceUpgraded, cleared',
      forged,
      bare,
      job,
      provenanceUpgraded(upgradedFrom(forged, job, bare)),
    )
  }

  // Backfill of missing dxScore / providerRecordId on equal scores, without bump
  {
    const existing = existingRecord('client_reported', { dxScore: null, providerRecordId: null })
    const job = clientJob('auto')
    const incoming = incomingRecord('equal')
    add(
      'equal / stored client_reported missing dxScore and providerRecordId / client job of another source → dxScore only',
      existing,
      incoming,
      job,
      expectImport('unchanged', {
        next: asNext(existing, { dxScore: 2410 }),
        bumpRevision: false,
        valueChanged: false,
        liveDelta: 0,
        eventKind: null,
      }),
    )
    add(
      'equal / stored client_reported missing dxScore and providerRecordId / client job of the same source → backfill both',
      existing,
      incoming,
      clientJob('auto', { source: 'dxrating-json' }),
      expectImport('unchanged', {
        next: asNext(existing, { dxScore: 2410, providerRecordId: '43' }),
        bumpRevision: false,
        valueChanged: false,
        liveDelta: 0,
        eventKind: null,
      }),
    )
    add(
      'equal / stored client_reported missing dxScore / server job → provenanceUpgraded with backfill',
      existing,
      incoming,
      serverJob('auto'),
      provenanceUpgraded(
        asNext(existing, {
          dxScore: 2410,
          providerRecordId: '43',
          provenance: jobProvenance(serverJob('auto'), incoming),
        }),
      ),
    )
    add(
      'worse / stored missing dxScore → unchanged, no backfill',
      existing,
      incomingRecord('worse'),
      job,
      untouched('unchanged'),
    )
    add(
      'equal / stored user_edited missing dxScore → keptUserEdit, no backfill',
      existingRecord('user_edited'),
      incoming,
      serverJob('user'),
      untouched('keptUserEdit'),
    )
    add(
      'equal / incoming without dxScore / stored missing dxScore → unchanged, nothing written',
      existing,
      incomingRecord('equal', { dxScore: null, providerRecordId: null }),
      job,
      untouched('unchanged'),
    )
  }

  // A manual record that is not user_edited is upgraded by an equal verified import
  {
    const existing = existingRecord('manual')
    const job = serverJob('auto')
    const incoming = incomingRecord('equal')
    add(
      'equal / stored manual client_reported / server job → provenanceUpgraded',
      existing,
      incoming,
      job,
      provenanceUpgraded(
        asNext(existing, { dxScore: 2410, providerRecordId: '43', provenance: jobProvenance(job, incoming) }),
      ),
    )
    add(
      'equal / stored manual client_reported / client job → unchanged, dxScore backfill only',
      existing,
      incoming,
      clientJob('user'),
      expectImport('unchanged', {
        next: asNext(existing, { dxScore: 2410 }),
        bumpRevision: false,
        valueChanged: false,
        liveDelta: 0,
        eventKind: null,
      }),
    )
  }

  // Equal verified records are never downgraded by client uploads, nor replaced by other verified sources
  add(
    'equal / stored verified / server job from another source → unchanged',
    existingRecord('verified'),
    incomingRecord('equal'),
    serverJob('user'),
    untouched('unchanged'),
  )

  // Flags decide between equal achievements; the winner is taken whole
  {
    const job = serverJob('auto')
    const incoming = incomingRecord('equal', { comboFlag: 'fcp', syncFlag: null })
    add(
      'equal achievement, better combo but worse sync → improved, flags taken whole',
      existingRecord('user_edited'),
      incoming,
      job,
      improved(job, incoming),
    )
    add(
      'equal achievement and combo, worse sync → unchanged',
      existingRecord('verified'),
      incomingRecord('equal', { syncFlag: 'sync' }),
      job,
      untouched('unchanged'),
    )
  }

  // Diving-Fish refreshes the best50 bucket of non-manual records
  {
    const dfJob = (trigger: string) =>
      serverJob(trigger, { id: 'dimp_df', source: 'diving-fish', sourceAccountId: 'df-user' })
    const verified = existingRecord('verified')
    add(
      'Diving-Fish / worse / stored verified without bucket → bucket refreshed as provenance-only update',
      verified,
      incomingRecord('worse', { best50Bucket: 'b35' }),
      dfJob('auto'),
      provenanceUpgraded(asNext(verified, { best50Bucket: 'b35' })),
    )
    const clientReported = existingRecord('client_reported', { best50Bucket: 'b35' })
    add(
      'Diving-Fish / equal / stored client_reported b35 → provenanceUpgraded, bucket from Diving-Fish',
      clientReported,
      incomingRecord('equal', { best50Bucket: 'b15' }),
      dfJob('auto'),
      provenanceUpgraded(upgradedFrom(clientReported, dfJob('auto'), incomingRecord('equal', { best50Bucket: 'b15' }))),
    )
    const sameSource = existingRecord('verified', {
      best50Bucket: 'b15',
      provenance: { ...EXISTING_PROVENANCE.verified!, source: 'diving-fish', sourceAccountId: 'df-user' },
    })
    add(
      'Diving-Fish / equal / stored same-source verified b15 → b35 refresh with bump',
      sameSource,
      incomingRecord('equal', { best50Bucket: 'b35' }),
      dfJob('auto'),
      provenanceUpgraded(
        asNext(sameSource, {
          best50Bucket: 'b35',
          provenance: {
            ...(sameSource.provenance as Obj),
            importJobId: 'dimp_df',
            fetchedAt: '2026-11-03T12:00:05.000Z',
            rawPayloadSha256: SHA('a'),
          },
        }),
      ),
    )
    add(
      'Diving-Fish / worse / stored with the same bucket → unchanged',
      existingRecord('verified', { best50Bucket: 'b35' }),
      incomingRecord('worse', { best50Bucket: 'b35' }),
      dfJob('auto'),
      untouched('unchanged'),
    )
    add(
      'Diving-Fish / worse / stored user_edited (manual) → keptUserEdit, bucket untouched',
      existingRecord('user_edited'),
      incomingRecord('worse', { best50Bucket: 'b35' }),
      dfJob('auto'),
      untouched('keptUserEdit'),
    )
    add(
      'Diving-Fish / equal / stored manual client_reported → provenance upgrade carries the bucket',
      existingRecord('manual'),
      incomingRecord('equal', { best50Bucket: 'b15' }),
      dfJob('auto'),
      provenanceUpgraded(
        asNext(existingRecord('manual'), {
          dxScore: 2410,
          providerRecordId: '43',
          best50Bucket: 'b15',
          provenance: jobProvenance(dfJob('auto'), incomingRecord('equal')),
        }),
      ),
    )
    const incoming = incomingRecord('better', { best50Bucket: 'b15' })
    add(
      'Diving-Fish / better → improved with bucket',
      existingRecord('verified', { best50Bucket: 'b35' }),
      incoming,
      dfJob('auto'),
      improved(dfJob('auto'), incoming),
    )
    add(
      'non-Diving-Fish / worse / stored bucket b35, incoming bucket b15 → unchanged',
      existingRecord('verified', { best50Bucket: 'b35' }),
      incomingRecord('worse', { best50Bucket: 'b15' }),
      serverJob('auto'),
      untouched('unchanged'),
    )
  }

  // Better replaces the whole record, dropping the stored dxScore / bucket / providerRecordId
  {
    const job = clientJob('user')
    const incoming = incomingRecord('better', { dxScore: null, providerRecordId: null, claimedSource: null })
    add(
      'better / incoming without optional fields → replaces them with null',
      existingRecord('verified', { best50Bucket: 'b15' }),
      incoming,
      job,
      improved(job, incoming),
    )
  }

  return cases
}

// ---------------------------------------------------------------------------------------------------------------
// manual-verification.json, manual-mutation.json

function manualVerificationVectors(): Obj[] {
  const base = (kind: keyof typeof EXISTING_PROVENANCE, overrides: Obj = {}) => existingRecord(kind, overrides)
  return [
    { name: 'no record', existing: null, expected: { verification: 'client_reported', editedFromJobId: null } },
    {
      name: 'tombstone of an import',
      existing: base('verified', { deletedAt: '2026-11-01T00:00:00.000Z' }),
      expected: { verification: 'client_reported', editedFromJobId: null },
    },
    {
      name: 'tombstone of a user edit',
      existing: base('user_edited', { deletedAt: '2026-11-01T00:00:00.000Z' }),
      expected: { verification: 'client_reported', editedFromJobId: null },
    },
    {
      name: 'manual client_reported',
      existing: base('manual'),
      expected: { verification: 'client_reported', editedFromJobId: null },
    },
    {
      name: 'verified import',
      existing: base('verified'),
      expected: { verification: 'user_edited', editedFromJobId: 'dimp_prev_lxns' },
    },
    {
      name: 'client_reported import',
      existing: base('client_reported'),
      expected: { verification: 'user_edited', editedFromJobId: 'dimp_prev_json' },
    },
    {
      name: 'user_edited keeps the job it overrode',
      existing: base('user_edited'),
      expected: { verification: 'user_edited', editedFromJobId: 'dimp_prev_lxns' },
    },
    {
      name: 'user_edited without a job',
      existing: base('user_edited', {
        provenance: { ...EXISTING_PROVENANCE.user_edited!, editedFromJobId: null },
      }),
      expected: { verification: 'user_edited', editedFromJobId: null },
    },
  ]
}

function manualMutationVectors(): Obj[] {
  const cases: Obj[] = []
  const add = (name: string, existing: Obj | null, mutation: Obj, expected: Obj) =>
    cases.push({ name, existing, mutation, expected })

  const set = (achievement: number, extra: Obj = {}): Obj => ({
    op: 'set',
    value: { achievement, comboFlag: null, syncFlag: null, ...((extra.value as Obj | undefined) ?? {}) },
    entryMethod: 'typed',
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'value')),
  })
  const del = (extra: Obj = {}): Obj => ({ op: 'delete', ...extra })

  const manualNext = (mutation: Obj, verification: string, editedFromJobId: string | null): Obj => {
    const value = mutation.value as Obj
    return {
      achievement: value.achievement!,
      comboFlag: value.comboFlag ?? null,
      syncFlag: value.syncFlag ?? null,
      // A manual set clears dxScore (§5.4, like iOS applyManualScore)
      dxScore: null,
      best50Bucket: null,
      providerRecordId: null,
      provenance: provenance({
        source: 'manual',
        fetchedBy: 'client',
        verification,
        entryMethod: mutation.entryMethod!,
        editedFromJobId,
      }),
      deleted: false,
    }
  }
  const applied = (next: Obj, eventKind: string, liveDelta: number): Obj => ({
    status: 'applied',
    reason: null,
    next,
    bumpRevision: true,
    valueChanged: eventKind !== 'delete',
    liveDelta,
    eventKind,
  })
  const notApplied = (status: string, reason: string | null = null): Obj => ({
    status,
    reason,
    next: null,
    bumpRevision: false,
    valueChanged: false,
    liveDelta: 0,
    eventKind: status === 'superseded' ? 'superseded' : null,
  })

  const verifiedAt6 = existingRecord('verified', { achievement: 1005000, comboFlag: null, syncFlag: null, revision: 6 })

  // New entries
  {
    const mutation = set(990000, { entryMethod: 'keypad', value: { comboFlag: 'fc', syncFlag: 'sync', dxScore: 1800 } })
    add(
      'set without record → client_reported, dxScore cleared',
      null,
      mutation,
      applied(manualNext(mutation, 'client_reported', null), 'manual_set', 1),
    )
    const photo = set(1000000, { entryMethod: 'photo', basedOnRevision: 3 })
    add(
      'set without record, with baseline → applied',
      null,
      photo,
      applied(manualNext(photo, 'client_reported', null), 'manual_set', 1),
    )
  }

  // §13: device A sets 99.0000 offline at baseline 5; a verified import lands at 6
  {
    const stale = set(990000, { basedOnRevision: 5 })
    add(
      'stale set worse than a verified record changed after the baseline → superseded',
      verifiedAt6,
      stale,
      notApplied('superseded'),
    )
    const reapplied = set(990000, { basedOnRevision: 6 })
    add(
      'explicit re-apply at the new baseline → applied, user_edited',
      verifiedAt6,
      reapplied,
      applied(manualNext(reapplied, 'user_edited', 'dimp_prev_lxns'), 'manual_set', 0),
    )
    const ahead = set(990000, { basedOnRevision: 9 })
    add(
      'baseline ahead of the record → applied',
      verifiedAt6,
      ahead,
      applied(manualNext(ahead, 'user_edited', 'dimp_prev_lxns'), 'manual_set', 0),
    )
    const noBaseline = set(990000)
    add(
      'set without basedOnRevision is baseline 0 → superseded by verified',
      verifiedAt6,
      noBaseline,
      notApplied('superseded'),
    )
    const nullBaseline = set(990000, { basedOnRevision: null })
    add(
      'set with null basedOnRevision is baseline 0 → superseded by verified',
      verifiedAt6,
      nullBaseline,
      notApplied('superseded'),
    )
    const better = set(1006000, { basedOnRevision: 5 })
    add(
      'stale set strictly better than the verified record → applied, user_edited',
      verifiedAt6,
      better,
      applied(manualNext(better, 'user_edited', 'dimp_prev_lxns'), 'manual_set', 0),
    )
    const betterByFlag = set(1005000, { basedOnRevision: 0, value: { comboFlag: 'fc' } })
    add(
      'stale set better by combo flag only → applied',
      verifiedAt6,
      betterByFlag,
      applied(manualNext(betterByFlag, 'user_edited', 'dimp_prev_lxns'), 'manual_set', 0),
    )
    const equalStale = set(1005000, { basedOnRevision: 5 })
    add('stale set of the value already stored → noop', verifiedAt6, equalStale, notApplied('noop'))
  }

  // Not verified: latest intent wins even when stale
  {
    const clientReported = existingRecord('client_reported', { revision: 8 })
    const mutation = set(990000, { basedOnRevision: 2 })
    add(
      'stale set over client_reported import → applied, user_edited',
      clientReported,
      mutation,
      applied(manualNext(mutation, 'user_edited', 'dimp_prev_json'), 'manual_set', 0),
    )
    const manual = existingRecord('manual', { revision: 8 })
    add(
      'stale set over manual client_reported → applied, client_reported',
      manual,
      mutation,
      applied(manualNext(mutation, 'client_reported', null), 'manual_set', 0),
    )
    const userEdited = existingRecord('user_edited', { revision: 8 })
    add(
      'stale set over user_edited → applied, user_edited keeps the overridden job',
      userEdited,
      mutation,
      applied(manualNext(mutation, 'user_edited', 'dimp_prev_lxns'), 'manual_set', 0),
    )
    const sameValue = set(1005000, { basedOnRevision: 8, value: { comboFlag: 'fc', syncFlag: 'fs' } })
    add('set of the stored value (manual) → noop', manual, sameValue, notApplied('noop'))
    const sameValueOtherMethod = set(1005000, { entryMethod: 'photo', value: { comboFlag: 'fc', syncFlag: 'fs' } })
    add('set of the stored value with another entry method → noop', manual, sameValueOtherMethod, notApplied('noop'))
    const sameDx = set(1005000, { basedOnRevision: 10, value: { comboFlag: 'fc', syncFlag: 'fs', dxScore: 2400 } })
    add('set of the stored value and dxScore → noop', existingRecord('verified'), sameDx, notApplied('noop'))
    const otherDx = set(1005000, { basedOnRevision: 10, value: { comboFlag: 'fc', syncFlag: 'fs', dxScore: 2300 } })
    add(
      'set of the stored value with another dxScore → noop (dxScore is not stored by a manual set)',
      existingRecord('verified'),
      otherDx,
      notApplied('noop'),
    )
    const worseCurrent = set(990000, { basedOnRevision: 10 })
    add(
      'set worse than a verified record not changed since the baseline → applied, user_edited',
      existingRecord('verified'),
      worseCurrent,
      applied(manualNext(worseCurrent, 'user_edited', 'dimp_prev_lxns'), 'manual_set', 0),
    )
  }

  // Tombstones
  {
    const tombstone = existingRecord('verified', { revision: 12, deletedAt: '2026-11-02T00:00:00.000Z' })
    const restore = set(980000)
    add(
      'set on a tombstone → restore, client_reported, even without baseline',
      tombstone,
      restore,
      applied(manualNext(restore, 'client_reported', null), 'restore', 1),
    )
    const restoreSame = set(1005000, { value: { comboFlag: 'fc', syncFlag: 'fs' } })
    add(
      'set of the tombstone value → restore',
      tombstone,
      restoreSame,
      applied(manualNext(restoreSame, 'client_reported', null), 'restore', 1),
    )
    add('delete on a tombstone → noop', tombstone, del({ basedOnRevision: 12 }), notApplied('noop'))
    add('delete without record → noop', null, del(), notApplied('noop'))
  }

  // Deletes
  {
    add(
      'stale delete of a verified record → superseded',
      verifiedAt6,
      del({ basedOnRevision: 5 }),
      notApplied('superseded'),
    )
    add(
      'delete without basedOnRevision of a verified record → superseded',
      verifiedAt6,
      del(),
      notApplied('superseded'),
    )
    add(
      'delete of a verified record at its revision → applied, tombstone keeps value and provenance',
      verifiedAt6,
      del({ basedOnRevision: 6 }),
      applied(asNext(verifiedAt6, { deleted: true }), 'delete', -1),
    )
    const clientReported = existingRecord('client_reported', { revision: 8 })
    add(
      'stale delete of a client_reported record → applied',
      clientReported,
      del({ basedOnRevision: 1 }),
      applied(asNext(clientReported, { deleted: true }), 'delete', -1),
    )
    const userEdited = existingRecord('user_edited', { revision: 8 })
    add(
      'delete without basedOnRevision of a user_edited record → applied',
      userEdited,
      del(),
      applied(asNext(userEdited, { deleted: true }), 'delete', -1),
    )
  }

  // Rejections
  {
    const record = existingRecord('manual')
    add('achievement above 1010000 → rejected', record, set(1010001), notApplied('rejected', 'invalid-achievement'))
    add('negative achievement → rejected', null, set(-1), notApplied('rejected', 'invalid-achievement'))
    add('fractional achievement → rejected', null, set(99.5), notApplied('rejected', 'invalid-achievement'))
    add(
      'unknown combo flag → rejected',
      null,
      set(1000000, { value: { comboFlag: 'fdx' } }),
      notApplied('rejected', 'invalid-combo-flag'),
    )
    add(
      'unknown sync flag → rejected',
      null,
      set(1000000, { value: { syncFlag: 'fdx' } }),
      notApplied('rejected', 'invalid-sync-flag'),
    )
    add(
      'negative dxScore → rejected',
      null,
      set(1000000, { value: { dxScore: -1 } }),
      notApplied('rejected', 'invalid-dx-score'),
    )
    add(
      'non-manual entry method → rejected',
      null,
      set(1000000, { entryMethod: 'import' }),
      notApplied('rejected', 'invalid-entry-method'),
    )
    add(
      'negative basedOnRevision → rejected',
      record,
      del({ basedOnRevision: -1 }),
      notApplied('rejected', 'invalid-based-on-revision'),
    )
    add(
      'maximum achievement → applied',
      null,
      set(1010000),
      applied(manualNext(set(1010000), 'client_reported', null), 'manual_set', 1),
    )
  }

  return cases
}

// ---------------------------------------------------------------------------------------------------------------

const STORED_RECORD_COMMENT =
  'Records: {achievement (int, 1/10000 %), comboFlag, syncFlag, dxScore, best50Bucket, providerRecordId, provenance{source, claimedSource, fetchedBy, verification, entryMethod, sourceAccountId, importJobId, rawPayloadSha256, fetchedAt, editedFromJobId}}; stored records add revision and deletedAt (tombstone when non-null); expected.next adds deleted instead (null next = nothing written). Timestamps are ISO 8601 and compared as instants.'

export function buildVectors(): Record<string, Obj> {
  return {
    'achievement.json': achievementVectors(),
    'score-merge.json': {
      $comment: `compareScore(a, b) returns -1 | 0 | 1. decideImportMerge(existing, incoming, job) returns expected {outcome, countKey, next, bumpRevision, valueChanged, liveDelta, eventKind}. ${STORED_RECORD_COMMENT}`,
      version: VERSION,
      compareScore: compareVectors(),
      decideImportMerge: importMergeVectors(),
    },
    'manual-verification.json': {
      $comment: `manualVerification(existing) returns expected {verification, editedFromJobId}. ${STORED_RECORD_COMMENT}`,
      version: VERSION,
      cases: manualVerificationVectors(),
    },
    'manual-mutation.json': {
      $comment: `decideManualMutation(existing, mutation) returns expected {status, reason, next, bumpRevision, valueChanged, liveDelta, eventKind}. mutation is {op: "set", basedOnRevision?, value{achievement, comboFlag, syncFlag, dxScore?}, entryMethod} or {op: "delete", basedOnRevision?}; a missing or null basedOnRevision is baseline 0. ${STORED_RECORD_COMMENT}`,
      version: VERSION,
      cases: manualMutationVectors(),
    },
  }
}

export function serializeVectors(vectors: Obj): string {
  return `${JSON.stringify(vectors, null, 2)}\n`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [file, vectors] of Object.entries(buildVectors())) {
    writeFileSync(new URL(file, import.meta.url), serializeVectors(vectors))
  }
}