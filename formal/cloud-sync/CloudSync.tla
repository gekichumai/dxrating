----------------------------- MODULE CloudSync -----------------------------
(***************************************************************************)
(* Cloud save sync between the browser tabs of one user and the server.   *)
(*                                                                         *)
(* Web client: apps/web/src/models/scores/CloudScoreRepository.ts (one    *)
(* repository per tab) over the IndexedDB cache all tabs share,           *)
(* apps/web/src/models/scores/cloudScoreDatabase.ts. Server:              *)
(* apps/backend/src/services/cloud-save/changes.ts (pullChanges, with the *)
(* paging rules of packages/maimai-domain/src/cloud-save-changes.ts),     *)
(* mutations.ts (decideManualMutation of maimai-domain score-merge.ts) and *)
(* cleanup.ts (tombstone purge). Tabs run without Web Locks, so every     *)
(* interleaving of two syncing tabs is allowed; with locks the behaviours *)
(* are a subset. Requests and responses may be lost; the two tabs'        *)
(* messages reorder freely.                                                *)
(*                                                                         *)
(* Each Bug_ constant switches one action back to the code before the     *)
(* commit in its name. The .cfg sets them all FALSE.                       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
    Tabs,
    MaxEdits,          \* manual edits (outbox entries) the user makes in all
    MaxRev,            \* imports and remote deletes stop at this save revision
    PageLimit,         \* the `limit` of a changes request
    MaxWriteFailures,  \* IndexedDB transactions of push() that may fail
    Bug_36f797e5_FullPullPages,
    Bug_f6fd8083_StaleAckPut,
    Bug_945ce071_BaselineFromPull,
    Bug_945ce071_DuplicateAckIssue,
    Bug_0b175c20_ForgetBeforeWrite

Sheets == {"a", "b"}
Ids == 1..MaxEdits

NoRec == [rev |-> 0, live |-> FALSE]
NoRecs == [s \in Sheets |-> NoRec]
NoMsg == [kind |-> "none"]
NoRes == [status |-> "none", sheet |-> "none", rec |-> NoRec]
NoMut == [sheet |-> "none", op |-> "none", based |-> 0, seen |-> 0]

Max2(x, y) == IF x >= y THEN x ELSE y
MaxOf(S) == CHOOSE x \in S : \A y \in S : y <= x
MinOf(S) == CHOOSE x \in S : \A y \in S : x <= y

VARIABLES
    \* server (score_saves.revision, tombstone_horizon, score_records)
    srv, srev, horizon,
    \* mutations.ts: the result of each processed mutation ID (idempotency)
    res,
    \* IndexedDB, shared by the tabs (cloudScoreDatabase.ts stores)
    cache, cursor, outbox, issues,
    \* per tab: CloudScoreRepository fields
    pc,         \* where runCycle is
    mrec,       \* serverRecords
    pub,        \* the serverRecords the view was last built from (refresh)
    mcur,       \* meta.lastSyncedRevision
    mout,       \* outbox (memory)
    unsaved,    \* unsaved: outbox entries not written to IndexedDB yet
    batch,      \* the entries of the push in flight
    pfull, pcur, coll, retried,  \* the pull in progress
    req, resp,  \* the request in flight and its response
    \* the user's edits
    muts, nextId,
    failures,
    \* ghosts for the invariants
    dismissed, regressed, blind, quiet, fresh

server == <<srv, srev, horizon, res>>
idb == <<cache, cursor, outbox, issues>>
tab == <<pc, mrec, pub, mcur, mout, unsaved, batch, pfull, pcur, coll, retried, req, resp>>
vars == <<server, idb, tab, muts, nextId, failures, dismissed, regressed, blind, quiet, fresh>>

SrvRec(rev) == [rev |-> rev, live |-> TRUE, verified |-> TRUE, purged |-> FALSE]
Present(sr) == sr.rev > 0 /\ ~sr.purged
AsRec(sr) == IF Present(sr) THEN [rev |-> sr.rev, live |-> sr.live] ELSE NoRec
LiveSet(recs) == {s \in Sheets : recs[s].live}

-----------------------------------------------------------------------------
(* IndexedDB writes (CloudScoreDatabase.write)                             *)

\* `recs` maps some sheets to records. putIfNotOlder: a record is written only
\* when its revision is at least the cached one (f6fd8083).
Put(c, recs) ==
    [s \in Sheets |->
        IF s \in DOMAIN recs /\ (Bug_f6fd8083_StaleAckPut \/ recs[s].rev >= c[s].rev)
        THEN recs[s] ELSE c[s]]

\* replaceRecords {throughRevision}: drops cached records up to it that the
\* full pull did not return, then puts the pulled ones.
Replace(c, recs, through) ==
    Put([s \in Sheets |-> IF recs[s].rev = 0 /\ c[s].rev <= through THEN NoRec ELSE c[s]],
        [s \in {x \in Sheets : recs[x].rev > 0} |-> recs[s]])

Regresses(c, c2) == \E s \in Sheets : c2[s].rev # 0 /\ c2[s].rev < c[s].rev

\* upsertNewer (CloudScoreRepository.ts)
Upsert(m, recs) ==
    [s \in Sheets |-> IF s \in DOMAIN recs /\ recs[s].rev >= m[s].rev THEN recs[s] ELSE m[s]]

\* Every write to the cache by tab t: other tabs' cycles are no longer quiet,
\* and no tab has a fresh sync any more.
CacheWrite(t, c2) ==
    /\ cache' = c2
    /\ regressed' = (regressed \/ Regresses(cache, c2))
    /\ quiet' = [u \in Tabs |-> IF u = t THEN quiet[u] ELSE FALSE]
    /\ fresh' = [u \in Tabs |-> FALSE]

-----------------------------------------------------------------------------
(* The view (rebuildView): the pending entries over `pub`                  *)

PendingOn(t, s) == {m \in mout[t] : muts[m].sheet = s}
ViewLive(t, s) ==
    IF PendingOn(t, s) = {} THEN pub[t][s].live ELSE muts[MaxOf(PendingOn(t, s))].op = "set"

-----------------------------------------------------------------------------
Init ==
    /\ srv = [s \in Sheets |-> IF s = "a" THEN SrvRec(1) ELSE SrvRec(3)]
    \* revision 2 was a tombstone of another chart, purged by the cleanup
    /\ srev = 3
    /\ horizon = 2
    /\ res = [m \in Ids |-> NoRes]
    \* a first sign-in on this browser, or a browser that last synced at
    \* revision 2, before chart b was imported
    /\ \E synced \in BOOLEAN :
        /\ cache = IF synced THEN [NoRecs EXCEPT !["a"] = [rev |-> 1, live |-> TRUE]] ELSE NoRecs
        /\ cursor = IF synced THEN 2 ELSE 0
    /\ outbox = {}
    /\ issues = {}
    /\ pc = [t \in Tabs |-> "idle"]
    /\ mrec = [t \in Tabs |-> cache]
    /\ pub = [t \in Tabs |-> cache]
    /\ mcur = [t \in Tabs |-> 0]
    /\ mout = [t \in Tabs |-> {}]
    /\ unsaved = [t \in Tabs |-> {}]
    /\ batch = [t \in Tabs |-> {}]
    /\ pfull = [t \in Tabs |-> FALSE]
    /\ pcur = [t \in Tabs |-> 0]
    /\ coll = [t \in Tabs |-> NoRecs]
    /\ retried = [t \in Tabs |-> FALSE]
    /\ req = [t \in Tabs |-> NoMsg]
    /\ resp = [t \in Tabs |-> NoMsg]
    /\ muts = [m \in Ids |-> NoMut]
    /\ nextId = 1
    /\ failures = 0
    /\ dismissed = {}
    /\ regressed = FALSE
    /\ blind = FALSE
    /\ quiet = [t \in Tabs |-> FALSE]
    /\ fresh = [t \in Tabs |-> FALSE]

-----------------------------------------------------------------------------
(* The user                                                                *)

\* setManual / delete -> enqueue (CloudScoreRepository.ts). basedOnRevision is
\* the revision of the published view (945ce071); enqueue then refreshes the
\* view from serverRecords. Its persistUnsaved writes the tab's unsaved
\* entries to the outbox, or IndexedDB refuses it and they stay in memory
\* until the next runCycle writes them.
Edit(t, s, op) ==
    /\ nextId <= MaxEdits
    /\ op = "delete" => ViewLive(t, s)
    /\ LET m == nextId
           seen == pub[t][s].rev
           based == IF Bug_945ce071_BaselineFromPull THEN mrec[t][s].rev ELSE seen
       IN /\ muts' = [muts EXCEPT ![m] = [sheet |-> s, op |-> op, based |-> based, seen |-> seen]]
          /\ nextId' = m + 1
          /\ mout' = [mout EXCEPT ![t] = @ \cup {m}]
          /\ \/ /\ outbox' = outbox \cup unsaved[t] \cup {m}
                /\ unsaved' = [unsaved EXCEPT ![t] = {}]
             \/ /\ unsaved' = [unsaved EXCEPT ![t] = @ \cup {m}]
                /\ UNCHANGED outbox
    /\ pub' = [pub EXCEPT ![t] = mrec[t]]
    /\ UNCHANGED <<server, cache, cursor, issues, pc, mrec, mcur, batch, pfull, pcur, coll,
                   retried, req, resp, failures, dismissed, regressed, blind, quiet, fresh>>

\* dismissIssue -> forgetIssue: the issue's deletion is written to IndexedDB.
\* Any tab may show the issue, so the model lets the user dismiss any stored one.
Dismiss(m) ==
    /\ m \in issues
    /\ issues' = issues \ {m}
    /\ dismissed' = dismissed \cup {m}
    /\ UNCHANGED <<server, cache, cursor, outbox, tab, muts, nextId, failures, regressed, blind,
                   quiet, fresh>>

-----------------------------------------------------------------------------
(* Writes from elsewhere: another device, an import job, the cleanup       *)

ServerChanged == /\ quiet' = [t \in Tabs |-> FALSE]
                 /\ fresh' = [t \in Tabs |-> FALSE]

\* server-imports.ts / merge.ts: an import writes a verified record
Import(s) ==
    /\ srev < MaxRev
    /\ srev' = srev + 1
    /\ srv' = [srv EXCEPT ![s] = SrvRec(srev + 1)]
    /\ ServerChanged
    /\ UNCHANGED <<horizon, res, idb, tab, muts, nextId, failures, dismissed, regressed, blind>>

\* another device deletes a live record (mutations.ts)
RemoteDelete(s) ==
    /\ srev < MaxRev
    /\ Present(srv[s]) /\ srv[s].live
    /\ srev' = srev + 1
    /\ srv' = [srv EXCEPT ![s] = [rev |-> srev + 1, live |-> FALSE, verified |-> FALSE, purged |-> FALSE]]
    /\ ServerChanged
    /\ UNCHANGED <<horizon, res, idb, tab, muts, nextId, failures, dismissed, regressed, blind>>

\* cleanup.ts: a tombstone is purged and the horizon moves past it
Purge(s) ==
    /\ Present(srv[s]) /\ ~srv[s].live
    /\ srv' = [srv EXCEPT ![s].purged = TRUE]
    /\ horizon' = Max2(horizon, srv[s].rev)
    /\ ServerChanged
    /\ UNCHANGED <<srev, res, idb, tab, muts, nextId, failures, dismissed, regressed, blind>>

-----------------------------------------------------------------------------
(* runCycle (CloudScoreRepository.ts)                                      *)

\* reload, then persistUnsaved
StartCycle(t) ==
    /\ pc[t] = "idle"
    /\ pc' = [pc EXCEPT ![t] = "push"]
    /\ outbox' = outbox \cup unsaved[t]
    /\ unsaved' = [unsaved EXCEPT ![t] = {}]
    /\ mrec' = [mrec EXCEPT ![t] = cache]
    /\ pub' = [pub EXCEPT ![t] = cache]
    /\ mcur' = [mcur EXCEPT ![t] = cursor]
    /\ mout' = [mout EXCEPT ![t] = outbox \cup unsaved[t]]
    /\ quiet' = [quiet EXCEPT ![t] = TRUE]
    /\ fresh' = [fresh EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<server, cache, cursor, issues, batch, pfull, pcur, coll, retried, req, resp,
                   muts, nextId, failures, dismissed, regressed, blind>>

\* pull(): a full pull when nothing was synced, else incremental
PullStart(t, from) ==
    /\ pfull' = [pfull EXCEPT ![t] = (from = 0)]
    /\ pcur' = [pcur EXCEPT ![t] = from]
    /\ coll' = [coll EXCEPT ![t] = NoRecs]
    /\ retried' = [retried EXCEPT ![t] = FALSE]
    /\ req' = [req EXCEPT ![t] = [kind |-> "changes", since |-> from,
                                  mode |-> IF from = 0 THEN "full" ELSE "incremental"]]
    /\ pc' = [pc EXCEPT ![t] = "pull"]

\* pullFull from 0; `again`: a mismatch after it is not chased further
FullStart(t, again) ==
    /\ pfull' = [pfull EXCEPT ![t] = TRUE]
    /\ pcur' = [pcur EXCEPT ![t] = 0]
    /\ coll' = [coll EXCEPT ![t] = NoRecs]
    /\ retried' = [retried EXCEPT ![t] = again]
    /\ req' = [req EXCEPT ![t] = [kind |-> "changes", since |-> 0, mode |-> "full"]]
    /\ pc' = [pc EXCEPT ![t] = "pull"]

PullDone(t) ==
    /\ pc' = [pc EXCEPT ![t] = "reload"]
    /\ req' = [req EXCEPT ![t] = NoMsg]
    /\ UNCHANGED <<pfull, pcur, coll, retried>>

\* The cycle ends. Its fields are dead until the next StartCycle sets them, so
\* they are cleared and states that differ only in them count once.
Idle(t) ==
    /\ pc' = [pc EXCEPT ![t] = "idle"]
    /\ batch' = [batch EXCEPT ![t] = {}]
    /\ pfull' = [pfull EXCEPT ![t] = FALSE]
    /\ pcur' = [pcur EXCEPT ![t] = 0]
    /\ coll' = [coll EXCEPT ![t] = NoRecs]
    /\ retried' = [retried EXCEPT ![t] = FALSE]
    /\ mcur' = [mcur EXCEPT ![t] = 0]
    /\ quiet' = [quiet EXCEPT ![t] = FALSE]

\* push(): the pending entries of the outbox, in one request
SendPush(t) ==
    /\ pc[t] = "push"
    /\ IF mout[t] = {}
       THEN /\ PullStart(t, mcur[t])
            /\ UNCHANGED batch
       ELSE /\ batch' = [batch EXCEPT ![t] = mout[t]]
            /\ req' = [req EXCEPT ![t] = [kind |-> "mutate"]]
            /\ pc' = [pc EXCEPT ![t] = "pushing"]
            /\ UNCHANGED <<pfull, pcur, coll, retried>>
    /\ UNCHANGED <<server, idb, mrec, pub, mcur, mout, unsaved, resp, muts, nextId, failures,
                   dismissed, regressed, blind, quiet, fresh>>

-----------------------------------------------------------------------------
(* The server's answer to a mutate request (mutations.ts)                  *)

\* decideManualMutation (maimai-domain score-merge.ts) for one entry. A manual
\* set is never strictly better than the verified record it meets: a better
\* one is applied by design, which no invariant is about.
ApplyOne(st, m) ==
    IF st.res[m] # NoRes THEN st
    ELSE LET mu == muts[m]
             e == st.srv[mu.sheet]
             live == Present(e) /\ e.live
             newerVerified == e.rev > mu.based /\ e.verified
             status == IF mu.op = "delete"
                       THEN IF ~live THEN "noop" ELSE IF newerVerified THEN "superseded" ELSE "applied"
                       ELSE IF live /\ newerVerified THEN "superseded" ELSE "applied"
             nrev == st.srev + 1
         IN IF status = "applied"
            THEN [st EXCEPT
                    !.srv = [@ EXCEPT ![mu.sheet] =
                                [rev |-> nrev, live |-> mu.op = "set", verified |-> FALSE, purged |-> FALSE]],
                    !.srev = nrev,
                    !.res = [@ EXCEPT ![m] = [status |-> "applied", sheet |-> mu.sheet,
                                              rec |-> [rev |-> nrev, live |-> mu.op = "set"]]],
                    !.blind = @ \/ (live /\ e.verified /\ e.rev > mu.seen)]
            ELSE [st EXCEPT !.res = [@ EXCEPT ![m] = [status |-> status, sheet |-> mu.sheet, rec |-> AsRec(e)]]]

RECURSIVE ApplyAll(_, _)
ApplyAll(st, ms) == IF ms = {} THEN st ELSE ApplyAll(ApplyOne(st, MinOf(ms)), ms \ {MinOf(ms)})

ServeMutate(t) ==
    /\ req[t].kind = "mutate"
    /\ LET st == ApplyAll([srv |-> srv, srev |-> srev, res |-> res, blind |-> blind], batch[t])
       IN /\ srv' = st.srv
          /\ srev' = st.srev
          /\ res' = st.res
          /\ blind' = st.blind
          /\ IF st.srev # srev THEN ServerChanged ELSE UNCHANGED <<quiet, fresh>>
    /\ req' = [req EXCEPT ![t] = NoMsg]
    /\ resp' = [resp EXCEPT ![t] = [kind |-> "acks"]]
    /\ UNCHANGED <<horizon, idb, pc, mrec, pub, mcur, mout, unsaved, batch, pfull, pcur, coll,
                   retried, muts, nextId, failures, dismissed, regressed>>

-----------------------------------------------------------------------------
(* push(): the acknowledgement                                             *)

AckRecs(t) ==
    LET withRec == {m \in batch[t] : res[m].rec.rev > 0}
        sheets == {res[m].sheet : m \in withRec}
    IN [s \in sheets |-> res[MaxOf({m \in withRec : res[m].sheet = s})].rec]

\* the acknowledged entries leave memory only once their write committed (0b175c20)
RecvAck(t) ==
    /\ resp[t].kind = "acks"
    /\ LET acked == batch[t]
           recs == [s \in DOMAIN AckRecs(t) |-> AckRecs(t)[s]]
           issueIds == {m \in acked : res[m].status = "superseded"}
           own == issueIds \cap unsaved[t]
           shared == issueIds \ unsaved[t]
           newIssues == IF Bug_945ce071_DuplicateAckIssue
                        THEN issueIds
                        ELSE own \cup (shared \cap outbox)
       IN /\ mrec' = [mrec EXCEPT ![t] = Upsert(mrec[t], recs)]
          /\ resp' = [resp EXCEPT ![t] = NoMsg]
          /\ \/ \* the transaction commits
                /\ CacheWrite(t, Put(cache, recs))
                /\ issues' = issues \cup newIssues
                /\ outbox' = outbox \ acked
                /\ unsaved' = [unsaved EXCEPT ![t] = @ \ acked]
                /\ mout' = [mout EXCEPT ![t] = @ \ acked]
                /\ pub' = [pub EXCEPT ![t] = Upsert(mrec[t], recs)]
                /\ PullStart(t, mcur[t])
                /\ batch' = [batch EXCEPT ![t] = {}]
                /\ UNCHANGED <<failures, mcur>>
             \/ \* IndexedDB refuses it: the cycle fails and backs off
                /\ failures < MaxWriteFailures
                /\ failures' = failures + 1
                /\ IF Bug_0b175c20_ForgetBeforeWrite
                   THEN /\ unsaved' = [unsaved EXCEPT ![t] = @ \ acked]
                        /\ mout' = [mout EXCEPT ![t] = @ \ acked]
                   ELSE UNCHANGED <<unsaved, mout>>
                /\ Idle(t)
                /\ UNCHANGED <<cache, issues, outbox, pub, req, regressed, fresh>>
    /\ UNCHANGED <<server, cursor, muts, nextId, dismissed, blind>>

-----------------------------------------------------------------------------
(* pullChanges (changes.ts) with changesResetRequired and pageOfChanges    *)
(* (packages/maimai-domain/src/cloud-save-changes.ts)                      *)

ServeChanges(t) ==
    /\ req[t].kind = "changes"
    /\ LET since == req[t].since
           reset == since > 0 /\ (since > srev \/ (req[t].mode = "incremental" /\ since < horizon))
           rows == {s \in Sheets : Present(srv[s]) /\ srv[s].rev > since /\ (since > 0 \/ srv[s].live)}
           page == {s \in rows : Cardinality({x \in rows : srv[x].rev < srv[s].rev}) < PageLimit}
           more == Cardinality(rows) > PageLimit
       IN resp' = [resp EXCEPT ![t] =
            IF reset
            THEN [kind |-> "page", reset |-> TRUE, recs |-> [s \in {} |-> NoRec], next |-> 0,
                  more |-> FALSE, sum |-> {}]
            ELSE [kind |-> "page", reset |-> FALSE, recs |-> [s \in page |-> AsRec(srv[s])],
                  next |-> IF more THEN MaxOf({srv[s].rev : s \in page}) ELSE srev,
                  more |-> more,
                  sum |-> IF more THEN {} ELSE {{s \in Sheets : Present(srv[s]) /\ srv[s].live}}]]
    /\ req' = [req EXCEPT ![t] = NoMsg]
    /\ UNCHANGED <<server, idb, pc, mrec, pub, mcur, mout, unsaved, batch, pfull, pcur, coll,
                   retried, muts, nextId, failures, dismissed, regressed, blind, quiet, fresh>>

\* `sum`: {} when the page carries no checksum, else {the live charts}. The
\* checksum (count, sumAchievement) tells which charts are live, never which
\* revision of a chart the cache holds.
Mismatch(sum, recs) == sum # {} /\ sum # {LiveSet(recs)}

\* pullFull: commits records and cursor only once the last page is in
CommitFull(t, c, cur, sum) ==
    /\ mrec' = [mrec EXCEPT ![t] = c]
    /\ pub' = [pub EXCEPT ![t] = c]
    /\ mcur' = [mcur EXCEPT ![t] = cur]
    /\ CacheWrite(t, Replace(cache, c, cur))
    /\ cursor' = cur
    /\ IF Mismatch(sum, c) /\ ~retried[t] THEN FullStart(t, TRUE) ELSE PullDone(t)

\* pullIncremental and pullFull: one page
RecvPage(t) ==
    /\ resp[t].kind = "page"
    /\ resp' = [resp EXCEPT ![t] = NoMsg]
    /\ LET p == resp[t]
           adv == p.next > pcur[t]
           cur == Max2(pcur[t], p.next)
           last == ~p.more \/ ~adv
       IN IF ~pfull[t]
          THEN IF p.reset
               \* a reset, on any page, hands over to a full pull
               THEN /\ FullStart(t, TRUE)
                    /\ UNCHANGED <<idb, mrec, pub, mcur, regressed, quiet, fresh>>
               ELSE LET m2 == Upsert(mrec[t], p.recs)
                    IN /\ mrec' = [mrec EXCEPT ![t] = m2]
                       /\ mcur' = [mcur EXCEPT ![t] = cur]
                       /\ CacheWrite(t, Put(cache, p.recs))
                       /\ cursor' = cur
                       /\ IF last
                          THEN /\ pub' = [pub EXCEPT ![t] = m2]
                               /\ IF Mismatch(p.sum, m2) THEN FullStart(t, TRUE) ELSE PullDone(t)
                          ELSE /\ pcur' = [pcur EXCEPT ![t] = cur]
                               /\ req' = [req EXCEPT ![t] = [kind |-> "changes", since |-> cur,
                                                             mode |-> "incremental"]]
                               /\ UNCHANGED <<pub, pc, pfull, coll, retried>>
                       /\ UNCHANGED <<outbox, issues>>
          ELSE IF p.reset
               THEN IF Bug_36f797e5_FullPullPages
                    \* before 36f797e5 a full pull read the reset page as its last
                    THEN /\ CommitFull(t, coll[t], pcur[t], {})
                         /\ UNCHANGED <<outbox, issues>>
                    \* a reset in the middle starts the full pull over from 0
                    ELSE /\ FullStart(t, retried[t])
                         /\ UNCHANGED <<idb, mrec, pub, mcur, regressed, quiet, fresh>>
               ELSE LET c2 == Upsert(coll[t], p.recs)
                    IN IF last
                       THEN /\ CommitFull(t, c2, cur, p.sum)
                            /\ UNCHANGED <<outbox, issues>>
                       ELSE /\ coll' = [coll EXCEPT ![t] = c2]
                            /\ pcur' = [pcur EXCEPT ![t] = cur]
                            /\ req' = [req EXCEPT ![t] =
                                 [kind |-> "changes", since |-> cur,
                                  mode |-> IF Bug_36f797e5_FullPullPages THEN "incremental" ELSE "full"]]
                            /\ UNCHANGED <<idb, mrec, pub, mcur, pc, pfull, retried, regressed, quiet, fresh>>
    /\ UNCHANGED <<server, unsaved, mout, batch, muts, nextId, failures, dismissed, blind>>

\* runCycle: the reload after the pull. A cycle that ran with no other write
\* to the server or the cache leaves the tab with a fresh sync.
EndCycle(t) ==
    /\ pc[t] = "reload"
    /\ Idle(t)
    /\ mrec' = [mrec EXCEPT ![t] = cache]
    /\ pub' = [pub EXCEPT ![t] = cache]
    /\ mout' = [mout EXCEPT ![t] = outbox \cup unsaved[t]]
    /\ fresh' = [fresh EXCEPT ![t] = quiet[t]]
    /\ UNCHANGED <<server, idb, unsaved, req, resp, muts, nextId, failures, dismissed, regressed,
                   blind>>

\* a mutate request, or a response, is lost: the cycle fails (handleFailure).
\* A lost changes request is the same as its lost response.
Lose(t) ==
    /\ req[t].kind = "mutate" \/ resp[t].kind # "none"
    /\ req' = [req EXCEPT ![t] = NoMsg]
    /\ resp' = [resp EXCEPT ![t] = NoMsg]
    /\ Idle(t)
    /\ UNCHANGED <<server, idb, mrec, pub, mout, unsaved, muts, nextId, failures, dismissed,
                   regressed, blind, fresh>>

-----------------------------------------------------------------------------
Next ==
    \/ \E t \in Tabs :
        \/ \E s \in Sheets, op \in {"set", "delete"} : Edit(t, s, op)
        \/ StartCycle(t)
        \/ SendPush(t)
        \/ ServeMutate(t)
        \/ RecvAck(t)
        \/ ServeChanges(t)
        \/ RecvPage(t)
        \/ EndCycle(t)
        \/ Lose(t)
    \/ \E m \in Ids : Dismiss(m)
    \/ \E s \in Sheets : Import(s) \/ RemoteDelete(s) \/ Purge(s)

Spec == Init /\ [][Next]_vars

TabSymmetry == Permutations(Tabs)

-----------------------------------------------------------------------------
(* Invariants                                                              *)

\* A sync cycle that ran while nothing else wrote to the server or the cache
\* leaves the cache holding exactly the server's live records.
Convergence ==
    \A t \in Tabs : fresh[t] =>
        \A s \in Sheets :
            /\ cache[s].live <=> (Present(srv[s]) /\ srv[s].live)
            /\ cache[s].live => cache[s].rev = srv[s].rev

\* No write puts an older revision of a record over the cached one.
CacheMonotonic == ~regressed

\* The server never applies an edit over a verified record newer than the one
\* the user saw when making it (only `superseded`, so the user decides).
NoBlindOverwrite == ~blind

\* An issue the user dismissed never comes back.
DismissedStaysDismissed == dismissed \cap issues = {}

\* Every edit is still queued (in IndexedDB or a tab's memory) or has its
\* answer: applied, a no-op, or an issue (kept or dismissed).
NoLostIntent ==
    \A m \in 1..(nextId - 1) :
        \/ m \in outbox
        \/ \E t \in Tabs : m \in unsaved[t]
        \/ res[m] # NoRes /\ (res[m].status \in {"applied", "noop"} \/ m \in issues \/ m \in dismissed)

=============================================================================
