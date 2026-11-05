import { z } from 'zod'

/**
 * Provenance vocabulary of cloud-save score records (meta#17, design §4.5 / §6). The values match the `CHECK`
 * constraints of `score_records` / `score_import_jobs`; lists only ever grow.
 */

/** Sources the server fetches from upstream itself; records from them can be `verified` */
export const SERVER_IMPORT_SOURCES = ['maimai-net-jp', 'maimai-net-intl', 'lxns', 'diving-fish'] as const
/** Sources whose data a client uploads (files, JSON, local migration); always `client_reported` */
export const CLIENT_IMPORT_SOURCES = ['aqua-dx', 'mu-net', 'aqua-sqlite', 'dxrating-json', 'legacy-local'] as const
/** Every source an import job can have */
export const IMPORT_SOURCES = [...SERVER_IMPORT_SOURCES, ...CLIENT_IMPORT_SOURCES] as const
/** Every source a record can have: an import source, or `manual` for user entry */
export const SCORE_SOURCES = [...IMPORT_SOURCES, 'manual'] as const

export const ServerImportSourceSchema = z.enum(SERVER_IMPORT_SOURCES)
export type ServerImportSource = z.infer<typeof ServerImportSourceSchema>

export const ClientImportSourceSchema = z.enum(CLIENT_IMPORT_SOURCES)
export type ClientImportSource = z.infer<typeof ClientImportSourceSchema>

export const ImportSourceSchema = z.enum(IMPORT_SOURCES)
export type ImportSource = z.infer<typeof ImportSourceSchema>

export const ScoreSourceSchema = z.enum(SCORE_SOURCES)
export type ScoreSource = z.infer<typeof ScoreSourceSchema>

export const FETCHED_BY = ['server', 'client'] as const
export const FetchedBySchema = z.enum(FETCHED_BY)
export type FetchedBy = z.infer<typeof FetchedBySchema>

export const VERIFICATIONS = ['verified', 'client_reported', 'user_edited'] as const
export const VerificationSchema = z.enum(VERIFICATIONS)
export type Verification = z.infer<typeof VerificationSchema>

export const ENTRY_METHODS = ['import', 'typed', 'keypad', 'photo', 'file', 'migration'] as const
export const EntryMethodSchema = z.enum(ENTRY_METHODS)
export type EntryMethod = z.infer<typeof EntryMethodSchema>

/** Entry methods of manual `set` mutations */
export const MANUAL_ENTRY_METHODS = ['typed', 'keypad', 'photo'] as const
export const ManualEntryMethodSchema = z.enum(MANUAL_ENTRY_METHODS)
export type ManualEntryMethod = z.infer<typeof ManualEntryMethodSchema>

export const SOURCE_ACCOUNT_KINDS = [
  'friend_code',
  'lxns_friend_code',
  'df_username',
  'df_qq',
  'segaid_hash',
  'claimed',
] as const
export const SourceAccountKindSchema = z.enum(SOURCE_ACCOUNT_KINDS)
export type SourceAccountKind = z.infer<typeof SourceAccountKindSchema>

export const IMPORT_TRIGGERS = ['user', 'auto', 'migration'] as const
export const ImportTriggerSchema = z.enum(IMPORT_TRIGGERS)
export type ImportTrigger = z.infer<typeof ImportTriggerSchema>

export function isServerImportSource(source: string): source is ServerImportSource {
  return (SERVER_IMPORT_SOURCES as readonly string[]).includes(source)
}

export function isClientImportSource(source: string): source is ClientImportSource {
  return (CLIENT_IMPORT_SOURCES as readonly string[]).includes(source)
}

/** The `fetched_by` an import job from `source` must have (§6.2) */
export function fetchedByForSource(source: ImportSource): FetchedBy {
  return isServerImportSource(source) ? 'server' : 'client'
}

const nullableText = z.string().min(1).nullable().default(null)
const nullableTimestamp = z.iso.datetime({ offset: true }).nullable().default(null)

/**
 * Field shape of a record's provenance (`RecordDTO.provenance`, §5.1). Optional fields may be omitted on input and
 * come out as `null`. Use {@link ProvenanceSchema} to also enforce the database invariants; this unrefined shape is
 * exported for `.extend()` / `.pick()`.
 */
export const ProvenanceShapeSchema = z.object({
  source: ScoreSourceSchema,
  /** The provider a client upload claims (e.g. `lxns` inside a DXRating JSON); display only, never trusted */
  claimedSource: nullableText,
  fetchedBy: FetchedBySchema,
  verification: VerificationSchema,
  entryMethod: EntryMethodSchema,
  sourceAccountId: nullableText,
  importJobId: nullableText,
  rawPayloadSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable()
    .default(null),
  /** Server clock for server jobs; client-claimed for client jobs */
  fetchedAt: nullableTimestamp,
  /** The import job a `user_edited` record overrode (audit) */
  editedFromJobId: nullableText,
})

/** A record's provenance, refined with the `score_records` CHECK constraints (§4.2) */
export const ProvenanceSchema = ProvenanceShapeSchema.superRefine((provenance, ctx) => {
  for (const message of provenanceViolations(provenance)) ctx.addIssue({ code: 'custom', message })
})
export type Provenance = z.output<typeof ProvenanceShapeSchema>
export type ProvenanceInput = z.input<typeof ProvenanceShapeSchema>

/** The `score_records` CHECK constraints a provenance breaks (empty when it is consistent) */
export function provenanceViolations(provenance: Provenance): string[] {
  const violations: string[] = []
  if (provenance.verification === 'verified') {
    if (provenance.fetchedBy !== 'server') violations.push('verified provenance must be fetched by the server')
    if (provenance.importJobId === null) violations.push('verified provenance needs an import job')
    if (provenance.rawPayloadSha256 === null) violations.push('verified provenance needs a payload hash')
    if (provenance.fetchedAt === null) violations.push('verified provenance needs a fetch time')
    if (!isServerImportSource(provenance.source)) violations.push('verified provenance needs a server import source')
  }
  if (provenance.source === 'manual' && provenance.verification === 'verified') {
    violations.push('manual records cannot be verified')
  }
  return violations
}