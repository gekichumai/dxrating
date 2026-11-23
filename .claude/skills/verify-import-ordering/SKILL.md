---
name: verify-import-ordering
description: Model-check cloud save imports against user deletes, the tombstone purge and the replace (TLA+ model formal/import-ordering). Use when a change touches the import short-circuit (counts.saveRevision), hasDeletionSince or chunks.timeBound, lockSave's clock, decideImportMerge, the tombstone purge, replaceRecords or manual delete/set in apps/backend/src/services/cloud-save or packages/maimai-domain/src/score-merge.ts.
---

# Verify import ordering

`formal/import-ordering/ImportOrdering.tla` is a TLA+ model of one chart of one cloud save. TLC tries every order of two automatic imports (each a server import or a one-chunk client upload), one user delete, one manual set, one replace and the tombstone purge. It checks two properties:

- **DeletionSticky.** An automatic import never revives a deletion that took the save lock at or after the moment the import job started. Harm: a score the user deleted comes back.
- **ShortCircuitSound.** When an import takes the content short-circuit (same payload hash as the last job, save unchanged), the chart is exactly what the full merge would have left: value, DX score, verification, source, deleted or not. Harm: a better or verified score stays hidden, or a purged record never returns.

## Does my change touch it?

Coverage, last confirmed at commit `ea52db703f8be2e06d2c759dc7c37f6b7ca9fbbf`:

| Code | Model |
| --- | --- |
| `apps/backend/src/services/cloud-save/merge.ts`: `shouldShortCircuit`, `hasDeletionSince`, `completeImportJob`, `applyImportRecords` | `ShortCircuits`, `Latest`, `HasDeletionSince`, `Reusable`, `RunMerge`, `CompleteServerJob`, `MergeSeq` |
| `apps/backend/src/services/cloud-save/client-imports.ts`: `applyClientImportChunk` (one chunk, `chunks.timeBound`, `saveRevision`) | `BeginClientChunk`, `ApplyClientChunk` |
| `apps/backend/src/services/cloud-save/replace.ts`: `replaceRecords` (no `saveRevision`, best entry per chart, `ifRevision`) | `BeginReplace`, `LockedReplace` |
| `apps/backend/src/services/cloud-save/cleanup.ts`: `runCloudSaveCleanup` step 1 (`CloudSave.purgeTombstones`, the `invalidated` CTE) | `PurgeTombstone` |
| `apps/backend/src/services/cloud-save/saves.ts`: `lockSave` (`clock_timestamp()` once locked), `saveTransaction` | the Begin/Locked split of every writer, `LockedDelete` |
| `apps/backend/src/services/cloud-save/mutations.ts`: `applyMutations` (delete, set) | `BeginDelete`, `LockedDelete`, `ManualSet` |
| `apps/backend/src/services/cloud-save/jobs.ts`: `startImportJob` (one running job per source), `finishImportJob` (`finished_at`, `saveRevision`) | `StartServerJob`, `RunningOf`, job rows |
| `apps/backend/src/services/cloud-save/records.ts`: `RecordWriter` (`deleted_at = save.now`, one revision per bump) | `LockedDelete`, `MergeBumps` |
| `apps/backend/src/services/cloud-save/server-imports.ts`: `runServerImport` | `StartServerJob`, `CompleteServerJob` |
| `apps/backend/src/db/schema.ts`: `score_import_jobs.started_at` default `now()` | `startedAt` = the transaction's begin time |
| `packages/maimai-domain/src/score-merge.ts`: `decideImportMerge`, `decideManualMutation`, `manualVerification`, `VERIFICATION_RANK` | `DecideImportMerge`, `ManualSet`, `Rank` |

List what changed in the covered code since the sync commit:

```sh
git diff --no-ext-diff ea52db703f8be2e06d2c759dc7c37f6b7ca9fbbf -- apps/backend/src/services/cloud-save apps/backend/src/db/schema.ts packages/maimai-domain/src/score-merge.ts
```

The folder holds files the model does not cover (export, changes, NET import routes); skip their hunks. If a hunk changes what a covered function decides, writes or orders, the model needs another look before the sync commit can move.

## Run it

```sh
formal/tlc.sh formal/import-ordering/ImportOrdering.tla   # this model, about 30 s, needs Java 11+
formal/check-all.sh                                       # every model, as the Formal models workflow does
pnpm guard:replays --needs tlc                            # the six past bugs must still fail the model
```

A pass ends with `Model checking completed. No error has been found.` A failure prints `Invariant <Name> is violated.` and the behavior that breaks it.

## Read a failure

Read TLC's error trace from `State 1` down. Each state names the action that produced it (`<LockedDelete ...>`) and the variables after it. The comment above each action in the `.tla` names the file and function it stands for. Retell the trace as a list of steps in the code's words, for example: "the delete's transaction begins; job J1 starts; the delete takes the lock and dates the tombstone; J1 completes and revives the record".

Then decide:

- **Real bug.** Every step is something the code allows: the lock does not prevent the order, and no constraint the model leaves out (see the scope below) stops it. Report the steps and reproduce them as a real-Postgres test in `apps/backend/src/test/cloud-save-merge.test.ts` or `cloud-save-client-imports.test.ts`. Do not weaken the invariant or the model to make it pass.
- **Modeling error.** A step cannot happen in the code: an action does more or less than the function it names, two steps the code does under one lock are split, or a guard the code has is missing. Fix the action to match the code, and say what you fixed.

The `lastShortCircuit` ghost holds `kept` (the chart the short-circuit left) and `merged` (what the full merge would have written); the fields that differ are the harm. The `lastRevival` ghost holds the reviving job's `startedAt` and the deletion's real lock time `deletionLockedAt`.

## Update it after an intended change

1. Change the action or operator that mirrors the code you changed, in the same PR. Keep the file and function named in its comment.
2. Run the model. If it fails, read the failure as above.
3. Run `pnpm guard:replays --needs tlc`. Each replay flips one `Bug_*` constant in `ImportOrdering.cfg` and must still fail with its invariant. If a replay passes, the change removed the code path that bug lived in: reintroduce the bug in the new action and keep the replay.
4. A new past bug gets its own `Bug_<commit>` constant (FALSE in the `.cfg`) and a replay in `scripts/guard-replays/replays/` with `needs: ["tlc"]`.
5. Move the sync commit above only after the model describes the code at the new commit, and update the coverage table.

## Scope and assumptions

Verified for every order of the steps above within these bounds: one chart, two automatic jobs, one delete, one manual set (to the lowest value), one replace, and any number of purges (at most one tombstone exists). The chart starts absent or as a verified LXNS record.

Not modeled: user-started imports (`trigger = 'user'`, never short-circuit, revive by design); multi-chunk client uploads (they never short-circuit); comboFlag and syncFlag (scores differ only in achievement); `providerRecordId`, `best50Bucket` and the Diving-Fish refresh; the catalog (`skippedUnknownSheet`); source accounts (one per source); the save's record limit; a replace that leaves the chart out and so deletes it. A DX score is a present/absent flag, so "the provider reports a different DX score" is out. A verified record's job reference refresh is not part of ShortCircuitSound: the short-circuit skipping it is by design.

Assumption: `PurgeTombstone` runs only when no job that started before the deletion is still running. The real purge waits for 90 days (`CLOUD_SAVE_RETENTION.tombstoneMs`), and a running job is abandoned after 15 minutes (`IMPORT_JOB_ABANDONED_AFTER_MS`).

Each step under the save lock is one TLC step, as Postgres serializes the holders of `score_saves ... FOR UPDATE` and each statement in READ COMMITTED sees the previous holder's commit. A transaction's `now()` (`started_at`, `finished_at`) is read when it begins, a separate step before the lock. One exception: `CompleteServerJob` stamps the server job's `finished_at` in its locked step. Only one LXNS job runs at a time, so the order of their `finished_at` is the same.
