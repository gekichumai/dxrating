/**
 * The paging rules of a cloud save's changes feed (§5.2, §5.6, §5.8), shared by the backend's `pullChanges` and the
 * web tests' fake server, so the fake cannot drift from the server.
 */

/**
 * `incremental`: the changes after `since`, reset when `since` is older than the tombstone horizon. `full`: a page of a
 * full pull, never reset by the horizon (§5.6)
 */
export type ChangesMode = 'incremental' | 'full'

/**
 * Whether a pull from `since` must start over from 0: `since` is ahead of the save's revision (the cursor does not
 * belong to this save) or, for an incremental pull, older than the tombstone horizon (a purged tombstone may be
 * missing). A full pull's later pages are never reset by the horizon: its first page held no tombstone at all, and
 * live rows keep their old revisions, so its cursor is routinely below the horizon.
 */
export function changesResetRequired(
  since: number,
  mode: ChangesMode,
  save: { revision: number; tombstoneHorizon: number },
): boolean {
  return since > 0 && (since > save.revision || (mode === 'incremental' && since < save.tombstoneHorizon))
}

/**
 * One page of the rows changed after the cursor. `rows` are those rows in revision order, at least `limit + 1` of them
 * when there are that many. `nextSince` is the highest revision of the page, or on the last page the save's revision,
 * so a finished pull resumes at or past the horizon.
 */
export function pageOfChanges<R extends { revision: number }>(
  rows: readonly R[],
  limit: number,
  saveRevision: number,
): { records: R[]; nextSince: number; hasMore: boolean } {
  const hasMore = rows.length > limit
  const records = rows.slice(0, limit)
  return { records, nextSince: hasMore ? records[records.length - 1]!.revision : saveRevision, hasMore }
}