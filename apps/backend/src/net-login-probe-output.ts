import { NetImportError } from './lib/functions/client'

// The RESULT line of the maimai NET login probe (net-login-probe.ts). It is meant to be pasted into an issue, so the
// submitted SEGA ID is replaced wherever SEGA's page or an error echoes it, and query strings (session IDs) are cut.

export type ProbeResult = { ok: true; recent: number } | { ok: false; error: unknown }

export function describeProbeResult(result: ProbeResult, submittedId: string): string {
  const scrub = (text: string) =>
    (submittedId ? text.split(submittedId).join('[id]') : text).replace(/\?[^\s"]*/g, '?…')
  if (result.ok) return `RESULT: success, logged in and read ${result.recent} recent records`
  const { error } = result
  if (error instanceof NetImportError) {
    const fields = [
      error.code,
      `step=${error.step ?? '-'}`,
      `net_error_code=${error.netErrorCode ?? '-'}`,
      `message=${JSON.stringify(error.message)}`,
      `upstream=${JSON.stringify(error.upstreamMessage ?? '-')}`,
    ]
    return scrub(`RESULT: ${fields.join(' ')}`)
  }
  const field = (name: string): unknown => (typeof error === 'object' && error ? Reflect.get(error, name) : undefined)
  const cause = field('cause')
  const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause ?? error)
  return scrub(`RESULT: ${String(field('_tag') ?? 'error')} ${String(field('operation') ?? '')} ${detail}`)
}