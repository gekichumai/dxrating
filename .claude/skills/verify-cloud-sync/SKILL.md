---
name: verify-cloud-sync
description: Model-check the cloud save sync between browser tabs and the server (formal/cloud-sync/CloudSync.tla, TLA+ with TLC). Use when a change touches CloudScoreRepository push/pull/enqueue/reload, the IndexedDB cache in cloudScoreDatabase.ts, the changes feed (pullChanges, cloud-save-changes.ts), the manual mutation rules (decideManualMutation) or the tombstone cleanup, or when asked whether a cloud sync race is possible.
---

# Verify cloud save sync

`formal/cloud-sync/CloudSync.tla` models two tabs of one user syncing one cloud save without Web Locks, over a network that loses and reorders requests, against a server that other devices, import jobs and the tombstone cleanup also write. TLC tries every order of their steps within the bounds below and checks five promises:

| Invariant | Promise | Harm when broken |
| --- | --- | --- |
| `Convergence` | A sync cycle that ran while nothing else wrote to the server or the cache leaves the cache holding exactly the server's live records. | Scores missing or stale on every later sync. |
| `CacheMonotonic` | No IndexedDB write puts an older revision of a record over the cached one. | A newer score silently replaced by an older one that the checksum cannot see. |
| `NoBlindOverwrite` | The server never applies an edit over a verified record newer than the one the user saw. | A stale manual edit wipes a verified import. |
| `DismissedStaysDismissed` | An issue the user dismissed never comes back. | Dismissed conflicts reappear. |
| `NoLostIntent` | Every edit stays queued or gets its answer (applied, no-op, or an issue). | A user's change disappears. |

## Does my change touch it?

Coverage, confirmed against the code at commit `ea52db703f8be2e06d2c759dc7c37f6b7ca9fbbf` (sync commit). Each action in the spec names its function.

- `apps/web/src/models/scores/CloudScoreRepository.ts`: `enqueue` (with `setManual`, `delete`), `runCycle`, `reload`, `persistUnsaved`, `push`, `pull`, `pullIncremental`, `pullFull`, `compareChecksum`, `rebuildView`, `dismissIssue`/`forgetIssue`, `upsertNewer`, `handleFailure` (as "the cycle fails").
- `apps/web/src/models/scores/cloudScoreDatabase.ts`: `CloudScoreDatabase.write` (`putRecords` guard, `replaceRecords`, `acknowledgeIssues`, `deleteOutbox`, `addOutbox`, `deleteIssues`, `meta`), `read`.
- `apps/backend/src/services/cloud-save/changes.ts`: `pullChanges`; `packages/maimai-domain/src/cloud-save-changes.ts`: `changesResetRequired`, `pageOfChanges`.
- `apps/backend/src/services/cloud-save/mutations.ts` and `packages/maimai-domain/src/score-merge.ts`: `decideManualMutation`, idempotent mutation IDs.
- `apps/backend/src/services/cloud-save/cleanup.ts`: tombstone purge and `tombstone_horizon`.

Run `git log --oneline ea52db703f8be2e06d2c759dc7c37f6b7ca9fbbf..HEAD -- <the files above>`. The first commit listed is the one that added this model (it routed `pullChanges` through `cloud-save-changes.ts` without changing behaviour). Any later commit there means the model needs another look.

## Run it

```sh
formal/tlc.sh formal/cloud-sync/CloudSync.tla   # this model, about 15 s, Java 11+
formal/check-all.sh                             # every model; the Formal models workflow runs it
pnpm guard:replays --needs tlc                  # each past bug must still fail its invariant
```

Pass: `Model checking completed. No error has been found.` A failure prints `Error: Invariant <Name> is violated.` and then the trace.

## Read a failure

Read TLC's error trace from the top: each `State n: <Action line ...>` names the action that ran, and the spec's comment above that action names the code. Look at `pc`, `req`, `resp`, `cache`, `cursor`, `outbox`, `issues` and `srv` from one state to the next, then tell the trace as steps in the code's words, for example "tab 2's `pullFull` gets page 1 (`a@1`), asks for page 2 with `since = 1` in incremental mode, the server resets it, and the pull commits `{a@1}` at cursor 1 without `b@3`".

Real bug or modeling error?

- Find the code each step names and check the step does what that code does, in that order. In the code, one `await` boundary may split what the model does in one step (an IndexedDB transaction is atomic; a network request and its response are two steps). If every step matches, it is a real bug: report the trace, do not weaken the invariant or the model.
- If a step does something the code cannot (for example a write the code guards, or two steps the code runs inside one transaction), the model is wrong: fix the action to match the code and rerun.
- An invariant that fails at the first state, or `TLC threw an unexpected exception`, is a spec error.

## Bounds and what is left out

Two tabs, charts `a` and `b`, one user edit, server writes from elsewhere up to save revision 4, one changes row per page, one failed IndexedDB write in `push()`. The save starts at `a@1`, `b@3` (both verified) with a purged tombstone at revision 2 (horizon 2); the browser's cache is either empty or synced at revision 2. A run with two edits did not finish in 6 minutes and found nothing in 18M states.

Not modeled: `reapplyIssue`, imports run by the client (`applyImport`, `runServerImport`), more than one save, `FULL_PULL_MAX_ATTEMPTS` (a full pull reset by the server starts over without a limit), the 60 s and debounce triggers (any tab may start a cycle at any time), `BroadcastChannel` (whether two tabs keep each other syncing is a liveness question this model does not ask), and liveness in general: a pull that never finishes is not a violation. A manual `set` is never strictly better than the verified record it meets. The checksum is modeled as the set of live charts (count and sum cannot tell two revisions of a chart apart). Batches are applied in mutation ID order.

## Update it

When a change to the covered code is intended:

1. Change the matching action in `CloudSync.tla` so it does what the new code does, keeping the file and function named in its comment.
2. Run `formal/tlc.sh formal/cloud-sync/CloudSync.tla`. A violation is a finding about the new code unless the model step is wrong (see above).
3. Run `pnpm guard:replays --needs tlc`. Each replay turns one `Bug_` constant on in `CloudSync.cfg` and must still fail its own invariant. If a replay's patch no longer applies, regenerate it as `scripts/guard-replays/README.md` says.
4. For a newly fixed sync bug, add a `Bug_<commit>_<what>` constant that switches its action back to the old code, set it `FALSE` in `CloudSync.cfg`, and add a replay that sets it `TRUE`.
5. After confirming the model describes the code at the new commit, move the sync commit above to it.
