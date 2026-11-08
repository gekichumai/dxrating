import { Clock, Effect } from 'effect'
import type { Principal } from './require-admin'

/**
 * The audit log of admin writes: one JSON line per write on stdout (Coolify's log view), next to `created_by` /
 * `updated_by` on the row itself. The row keeps the short `actor`; the line keeps the whole principal as Access
 * vouched for it (email, Access user id `sub`, identity provider; an agent's token name and service token), so a
 * write stays attributable to one Access identity even if an email is later reused. Never the token itself.
 */
export interface AuditEntry {
  readonly action: string
  readonly target?: string | number | undefined
  readonly dryRun?: boolean | undefined
  readonly outcome: 'ok' | 'not_found'
}

export const auditLine = (principal: Principal, entry: AuditEntry, at: Date) => ({
  level: 'info' as const,
  event: 'admin_audit',
  at: at.toISOString(),
  actor: principal.actor,
  principalType: principal.type,
  principalId: principal.id,
  email: principal.access.email ?? null,
  accessSubject: principal.access.subject ?? null,
  identityProvider: principal.access.identityProvider ?? null,
  accessCommonName: principal.access.commonName ?? null,
  action: entry.action,
  target: entry.target ?? null,
  dryRun: entry.dryRun ?? false,
  outcome: entry.outcome,
})

export const audit = (principal: Principal, entry: AuditEntry) =>
  Effect.flatMap(Clock.currentTimeMillis, (ms) =>
    Effect.sync(() => console.log(JSON.stringify(auditLine(principal, entry, new Date(ms))))),
  )