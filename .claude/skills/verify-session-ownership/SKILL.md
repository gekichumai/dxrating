---
name: verify-session-ownership
description: Model-check which account the web's active cloud save, cached features and stored save selection belong to when another tab signs a different account in (TLA+ model formal/session-ownership). Use when a change touches useActiveSaveDecision or defaultActiveSaveDependencies in apps/web/src/models/scores/ActiveSaveContext.tsx, getUserFeatures in userFeatures.ts, CloudScoreRepository's onStopped or dispose paths, privateApiClient / privateApiClientFor, or requireExpectedUser on the backend.
---

# Verify session ownership

**Property.** Whatever order the session cookie changes, requests answer and effects run in, the calculator only ever reads or writes the signed-in account's cloud save, the features stored under an account are that account's, and a stored save selection is cleared only when its save is gone.

**Harm when it breaks.** Account B sees or edits account A's scores, B's feature flags are cached as A's for the browser session, or a reload silently opens the local save instead of the cloud save the user chose.

The model is `formal/session-ownership/SessionOwnership.tla`; `SessionOwnership.cfg` is the passing configuration.

## Does my change touch the verified code?

Synced at commit `ea52db703f8be2e06d2c759dc7c37f6b7ca9fbbf`. The commit that added this skill changed only how `cloud-save-router.ts` wires `requireExpectedUser` (one base for every route), not what the server answers. List what changed since:

```sh
git diff --no-ext-diff --stat ea52db703f8be2e06d2c759dc7c37f6b7ca9fbbf..HEAD -- \
  apps/web/src/models/scores/ActiveSaveContext.tsx apps/web/src/models/scores/userFeatures.ts \
  apps/web/src/models/scores/CloudScoreRepository.ts apps/web/src/lib/privateApi.ts \
  apps/backend/src/orpc-middleware.ts apps/backend/src/cloud-save-router.ts
```

| Code | Function | Model |
| --- | --- | --- |
| `ActiveSaveContext.tsx` | `useActiveSaveDecision`, the effect on `[userId, selectionVersion]` | `EffectRun`, `DecFeatures`, `DecList`, `DecOpen` |
| `ActiveSaveContext.tsx` | the `[cloudRepository]` effect (dispose with flush) | `SetRepo` |
| `ActiveSaveContext.tsx` | `onStopped` inside the decision | `OnStopped`, `RepoStops`, `FlushStops` |
| `ActiveSaveContext.tsx` | `exposedRepository` (render) | `Exposed` |
| `ActiveSaveContext.tsx` | `setActiveSaveId`, `readActiveSaveId`, `writeActiveSaveId` | `SelectSave`, `sel`, `ClearSel` |
| `ActiveSaveContext.tsx` | `defaultActiveSaveDependencies.fetchFeatures`, `ensureSessionUser` | `FeatCheck1`, `FeatGet`, `FeatCheck2`, `FeatFail` |
| `ActiveSaveContext.tsx` | `defaultActiveSaveDependencies.listSaves` | `DecList` |
| `userFeatures.ts` | `getUserFeatures` (memoryCache, sessionStorage), `clearUserFeaturesCache` | `req`, `featCache`, `OnStopped` |
| `CloudScoreRepository.ts` | `classifySyncError`, `handleFailure`, `dispose` (flush before `disposed`) | `RepoAnswer`, `RepoStops`, `FlushStops`, `FlushEnds` |
| `privateApi.ts` | `privateApiClientFor(userId)` (sends `X-DXRating-Expected-User`) | `RepoAnswer` (`mismatch`) |
| `orpc-middleware.ts`, `cloud-save-router.ts` | `requireSession`, `requireFeature`, `requireExpectedUser`: 401, then 404, then 409 | `RepoAnswer` order |
| Better Auth cookie, `authClient.useSession()` | the session other tabs change; when this tab learns of it | `SwitchSession`, `SessionRefresh` |

If the diff touches a function in this table, read the matching action and check it still says what the code does before you trust a pass.

## Run it

```sh
formal/tlc.sh formal/session-ownership/SessionOwnership.tla
```

Java 11 or later; the script downloads a pinned TLC. About 200,000 distinct states in a few seconds. A pass ends with `Model checking completed. No error has been found.` `formal/check-all.sh` runs every model, as the `Formal models` workflow does.

The past bugs are guard replays: `node scripts/guard-replays/run.ts --needs tlc` (or `--only model-session-ownership-late-404` and so on). Each sets one `Bug_<sha>` constant TRUE and expects its own invariant to fail.

## Read a result

TLC prints `Error: Invariant <Name> is violated.`, then `The behavior up to this point is:` and one `State N: <Action line ...>` block per step with every variable. Read the action names down the trace and turn each into the code in the table above. The `/statechart` skill is not set up in this repo, so read TLC's error trace directly. Variables: `cookie` is the session the server sees, `seen` what this tab's `useSession` says, `sel` the stored selection per account, `repo` the `cloudRepository` state, `flushing` repositories still flushing in `dispose()`, `featCache[u]` whose features are stored under `u`, `req[u]` the `fetchFeatures(u)` in flight (`ans` is whose features it got).

| Invariant | Says | Past bug it catches |
| --- | --- | --- |
| `ExposedOwner` | the repository a render exposes belongs to `seen` | `Bug_945ce071` |
| `RepositoryDroppedOnSwitch` | once the effect ran for `seen`, no other account's repository is active | `Bug_0d2a2e32` |
| `FeaturesHonest` | `featCache[u]` is `u`'s or empty | `Bug_61f5edfe` |
| `SelectionClearedOnlyWhenGone` | the code never clears a selection whose save still exists | `Bug_cc07485f` |

## Real bug or modeling error?

- **Real bug**: every step of the trace can happen in that order in the code. The only places another step can come between two of the code's steps are `await`s, React running an effect after the render that scheduled it, and a promise continuation running between a non-click `setState` and the effect cleanup it causes. Report the trace in the code's words (which account, which request, which `localStorage` / `sessionStorage` key) and do not weaken the invariant or the model to make it pass.
- **Modeling error**: a step in the trace splits code that runs in one synchronous block, lets an action fire that the code cannot reach (a server answer in the wrong order, a request for a save the account does not own), or TLC stops with a parse, type or `TypeOK` error. Fix the action so it matches the code it names, then rerun.
- A pass covers only the bounds and assumptions below.

## Open findings (today's code)

Each `Finding_<name>` constant, set TRUE, is today's code on a path where TLC finds a violation. `SessionOwnership.cfg` sets them FALSE so the check passes and keeps guarding everything else. When the code is fixed, delete the constant, keep the fixed branch, and turn the old branch into a `Bug_<sha>` constant with a guard replay.

1. `Finding_ListSavesUnbound` (`SelectionClearedOnlyWhenGone`). A's decision has A's features cached; another tab signs B in; `listSaves()` leaves through the unbound `privateApiClient` with B's cookie; B's list lacks A's chosen save, so `writeActiveSaveId(storage, A, null)` runs with the "save missing" toast, and A's next visit opens the local save. FALSE models the fix: `privateApiClientFor(userId).cloudSave.saves.list()`, which the server already answers 409 for another account (read as a failure: `fallBackToLocal`, no clear).
2. `Finding_ListClearsAnySave` (`SelectionClearedOnlyWhenGone`). A's decision for save `a1` waits on `listSaves()`; `a1` is deleted on another device; the migration's `onActivate` calls `setActiveSaveId('a2')` after an `await`, so the effect cleanup that cancels the decision runs later; the list answers without `a1` and `writeActiveSaveId(storage, A, null)` clears `a2`. FALSE models the fix `onStopped` got in cc07485f: clear only while `readActiveSaveId(storage, userId) === saveId`.
3. `Finding_FeaturesSwitchBack` (`FeaturesHonest`). `ensureSessionUser(A)` passes; another tab signs B in; `features.get()` leaves with B's cookie; another tab signs A in again; the second `ensureSessionUser(A)` passes; B's features are stored under `dxr-features:A` for the browser session. FALSE assumes the session changes at most once while one features request is in flight. A fix: send `features.get` through `privateApiClientFor(userId)` and check the header on `GET /me/features` on the server.

## Bounds and what is left out

- Accounts `a` and `b`; saves `a1`, `a2` (a's) and `b1` (b's); at most 3 session changes, 2 selections and 2 deletions; one tab runs the decision, other tabs only change the cookie.
- Every account has cloud save on: features turned off mid-session (a 404 that clears the selection on purpose) and `refreshFeatures` are not modeled.
- Not modeled: `useSession`'s loading state, the decision timeout and its toasts, the sync protocol inside `CloudScoreRepository` (outbox, acks, pages), and server writes. Two repositories for the same account and save compare equal.
- The server half of the property, that every private write refuses another account, is a real-server test, not this model: `apps/backend/src/test/private-route-binding.test.ts` sends each non-GET route of `privateContractRoutes` and the NET import without the header (400) and for another account (409 `ACCOUNT_MISMATCH`).

## Update the model

1. Change the action that names the code you changed, keeping its code pointer comment accurate. Add a variable only for state the code keeps.
2. Run the model. A new violation is a finding until you show it is a modeling error.
3. For a fixed bug, add `Bug_<short sha>` (FALSE in the `.cfg`) that switches the action back, and a guard replay under `scripts/guard-replays/replays/model-session-ownership-<short>/` whose patch sets it TRUE, with `"needs": ["tlc"]` and the invariant in `expect`.
4. Move the sync commit above forward only after you have checked every row of the coverage table against the code at the new commit.
