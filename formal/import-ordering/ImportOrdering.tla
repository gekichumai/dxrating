--------------------------- MODULE ImportOrdering ---------------------------
(***************************************************************************)
(* Cloud save imports against user deletes, the tombstone purge and the    *)
(* replace, on one chart of one save (apps/backend/src/services/          *)
(* cloud-save and packages/maimai-domain/src/score-merge.ts).              *)
(*                                                                         *)
(* Every writer runs in one transaction that holds the save row FOR UPDATE *)
(* (saves.ts lockSave), so each "under the lock" action below is one TLC   *)
(* step. What a transaction does before it gets the lock (its now(), the   *)
(* time Postgres gives started_at and finished_at) is a separate step.     *)
(*                                                                         *)
(* Each Bug_* constant puts one action back to the code before a past fix. *)
(***************************************************************************)
EXTENDS Integers, Sequences

CONSTANTS
  MaxClock,
  \* merge.ts shouldShortCircuit before 1884c52: trusted the last payload hash without the save revision.
  Bug_3d6f21a3,
  \* saves.ts lockSave before 0d12d685: writes were dated now(), the transaction start, not the lock time.
  Bug_0d12d685_LockTime,
  \* merge.ts completeImportJob before 20fd1229: recorded saveRevision after skipping a deletion newer than the job.
  Bug_20fd1229,
  \* client-imports.ts applyClientImportChunk before b4850bef: the same, for client uploads (no chunks.timeBound).
  Bug_b4850bef,
  \* cleanup.ts purgeTombstones before d95f7c29: the purge left counts.saveRevision on the save's jobs.
  Bug_d95f7c29,
  \* replace.ts replaceRecords before 0d12d685: the replace recorded saveRevision like a merge.
  Bug_0d12d685_Replace

None == -1
NoJob == "none"

(* Achievements stand for 990000 < 1000000 < 1005000; dx is whether the row has a DX score. *)
Achievements == 1..3
ManualValue == 1

(* Two automatic jobs, each a server import (LXNS) or a one-chunk client upload (dxrating-json), and one replace. *)
AutoJobs == {"J1", "J2"}
Jobs == AutoJobs \cup {"R"}

Rank(v) == IF v = "verified" THEN 2 ELSE 1   \* score-merge.ts VERIFICATION_RANK

Absent == [present |-> FALSE, ach |-> 0, dx |-> FALSE, verification |-> "none", source |-> "none", deletedAt |-> None]
Records == {Absent} \cup
  [present: {TRUE}, ach: Achievements, dx: BOOLEAN, verification: {"verified", "client_reported", "user_edited"},
   source: {"lxns", "dxrating-json", "manual"}, deletedAt: (0..MaxClock) \cup {None}]

InitRecords ==
  {Absent, [present |-> TRUE, ach |-> 3, dx |-> FALSE, verification |-> "verified", source |-> "lxns", deletedAt |-> None]}

VARIABLES
  clock,
  rec,         \* the score_records row of the chart
  saveRev,     \* score_saves.revision
  jobs,        \* score_import_jobs rows, plus where each job's transaction is
  del,         \* the user's delete mutation (mutations.ts applyMutations)
  replace,     \* the user's replace (replace.ts replaceRecords)
  manualDone,
  delLockedAt, \* ghost: when the delete held the lock, whatever deleted_at says
  lastShortCircuit, \* ghost: the record the last short-circuit kept, and what the full merge would have left
  lastRevival  \* ghost: the last tombstone an automatic job revived

vars == <<clock, rec, saveRev, jobs, del, replace, manualDone, delLockedAt, lastShortCircuit, lastRevival>>

SourceOf(j) == IF jobs[j].kind = "server" THEN "lxns" ELSE "dxrating-json"
VerificationOf(j) == IF jobs[j].kind = "server" THEN "verified" ELSE "client_reported"

(* One fixed payload per source, so every later job of a source has the hash of the earlier ones: the case the   *)
(* short-circuit exists for. The client payload lists the chart twice, as in "past a replace" (merge test).       *)
PayloadOf(j) ==
  IF jobs[j].kind = "server" THEN << [ach |-> 3, dx |-> FALSE] >>
  ELSE << [ach |-> 3, dx |-> FALSE], [ach |-> 3, dx |-> TRUE] >>

Times == (0..MaxClock) \cup {None}
JobRows == [kind: {"none", "server", "client", "replace"}, phase: {"idle", "begun", "running", "succeeded", "failed"},
            beganAt: Times, startedAt: Times, finishedAt: Times, saveRevision: Nat \cup {None}]

TypeOK ==
  /\ clock \in 0..MaxClock
  /\ rec \in Records
  /\ saveRev \in Nat
  /\ jobs \in [Jobs -> JobRows]
  /\ manualDone \in BOOLEAN

Init ==
  /\ clock = 0
  /\ rec \in InitRecords
  /\ saveRev = 0
  /\ jobs = [j \in Jobs |-> [kind |-> IF j = "R" THEN "replace" ELSE "none", phase |-> "idle", beganAt |-> None,
                             startedAt |-> None, finishedAt |-> None, saveRevision |-> None]]
  /\ del = [phase |-> "idle", beganAt |-> None]
  /\ replace = [phase |-> "idle", ifRevision |-> None]
  /\ manualDone = FALSE
  /\ delLockedAt = None
  /\ lastShortCircuit = {}
  /\ lastRevival = {}

Live(r) == r.present /\ r.deletedAt = None
Tombstone(r) == r.present /\ r.deletedAt # None

Visible(r) ==
  [present |-> r.present, ach |-> r.ach, dx |-> r.dx, verification |-> r.verification, source |-> r.source,
   deleted |-> Tombstone(r)]

(***************************************************************************)
(* maimai-domain score-merge.ts decideImportMerge, for one incoming entry. *)
(* Every modeled job is automatic (trigger 'auto'), which never revives a  *)
(* tombstone with an equal or worse score.                                 *)
(***************************************************************************)
Fresh(e, j) ==
  [present |-> TRUE, ach |-> e.ach, dx |-> e.dx, verification |-> VerificationOf(j), source |-> SourceOf(j),
   deletedAt |-> None]
Decision(outcome, r, bump) == [outcome |-> outcome, rec |-> r, bump |-> bump]

DecideImportMerge(r, e, j) ==
  IF ~r.present THEN Decision("inserted", Fresh(e, j), TRUE)
  ELSE IF Tombstone(r) THEN
    IF r.deletedAt >= jobs[j].startedAt THEN Decision("skippedDeleted", r, FALSE)
    ELSE IF e.ach > r.ach THEN Decision("revived", Fresh(e, j), TRUE)
    ELSE Decision("skippedDeleted", r, FALSE)
  ELSE IF e.ach > r.ach THEN Decision("improved", Fresh(e, j), TRUE)
  ELSE IF e.ach = r.ach /\ r.verification # "user_edited" THEN
    IF Rank(VerificationOf(j)) > Rank(r.verification)
    THEN Decision("provenanceUpgraded",
                  [r EXCEPT !.dx = e.dx, !.verification = VerificationOf(j), !.source = SourceOf(j)], TRUE)
    ELSE IF Rank(VerificationOf(j)) = Rank(r.verification) /\ (r.verification # "verified" \/ r.source = SourceOf(j))
    \* the DX score backfill (a verified row of the same origin refreshes its job reference too, which is not modeled)
    THEN Decision("unchanged", [r EXCEPT !.dx = r.dx \/ e.dx], FALSE)
    ELSE Decision("unchanged", r, FALSE)
  ELSE Decision(IF r.verification = "user_edited" THEN "keptUserEdit" ELSE "unchanged", r, FALSE)

(* merge.ts applyImportRecords: entries in payload order, each decided against the previous one's result. *)
RECURSIVE MergeSeq(_, _, _)
MergeSeq(r, payload, j) ==
  IF payload = << >> THEN << >>
  ELSE LET d == DecideImportMerge(r, Head(payload), j) IN << d >> \o MergeSeq(d.rec, Tail(payload), j)

RECURSIVE CountBumps(_)
CountBumps(ds) == IF ds = << >> THEN 0 ELSE (IF Head(ds).bump THEN 1 ELSE 0) + CountBumps(Tail(ds))

Merged(r, j) == LET ds == MergeSeq(r, PayloadOf(j), j) IN ds[Len(ds)].rec
MergeBumps(r, j) == CountBumps(MergeSeq(r, PayloadOf(j), j))
MergeSkippedDeleted(r, j) == \E i \in 1..Len(PayloadOf(j)) : MergeSeq(r, PayloadOf(j), j)[i].outcome = "skippedDeleted"
MergeRevived(r, j) == \E i \in 1..Len(PayloadOf(j)) : MergeSeq(r, PayloadOf(j), j)[i].outcome = "revived"

(* merge.ts hasDeletionSince, read after the merge wrote its rows *)
HasDeletionSince(r, since) == Tombstone(r) /\ r.deletedAt >= since

(***************************************************************************)
(* merge.ts shouldShortCircuit: the latest succeeded job of the same       *)
(* source (ORDER BY finished_at DESC, started_at DESC; a tie is any of     *)
(* them) has the same payload hash and recorded the current save revision. *)
(***************************************************************************)
Prior(j) == {k \in Jobs \ {j} : jobs[k].phase = "succeeded" /\ SourceOf(k) = SourceOf(j)}
Newer(a, b) ==
  \/ jobs[a].finishedAt > jobs[b].finishedAt
  \/ jobs[a].finishedAt = jobs[b].finishedAt /\ jobs[a].startedAt > jobs[b].startedAt
Latest(j) == {k \in Prior(j) : \A o \in Prior(j) : ~Newer(o, k)}
PreviousChoices(j) == IF Latest(j) = {} THEN {NoJob} ELSE Latest(j)

ShortCircuits(j, previous) ==
  /\ previous # NoJob
  /\ PayloadOf(previous) = PayloadOf(j)
  /\ \/ Bug_3d6f21a3
     \/ jobs[previous].saveRevision # None /\ jobs[previous].saveRevision = saveRev

(* The record after this job: unchanged on a short-circuit, else the full merge; with the ghosts it leaves. *)
RunMerge(j, previous) ==
  IF ShortCircuits(j, previous)
  THEN /\ lastShortCircuit' = {[job |-> j, kept |-> Visible(rec), merged |-> Visible(Merged(rec, j))]}
       /\ UNCHANGED <<rec, saveRev, lastRevival>>
  ELSE /\ rec' = Merged(rec, j)
       /\ saveRev' = saveRev + MergeBumps(rec, j)
       /\ lastRevival' = IF MergeRevived(rec, j)
                         THEN {[job |-> j, startedAt |-> jobs[j].startedAt, deletionLockedAt |-> delLockedAt]}
                         ELSE lastRevival
       /\ UNCHANGED lastShortCircuit

(* Whether the job may record the revision it leaves for a later identical job (counts.saveRevision). *)
Reusable(j, previous, timeBoundBug) ==
  \/ ShortCircuits(j, previous)
  \/ timeBoundBug
  \/ ~(MergeSkippedDeleted(rec, j) /\ HasDeletionSince(Merged(rec, j), jobs[j].startedAt))

RunningOf(source) == {k \in Jobs : jobs[k].phase = "running" /\ SourceOf(k) = source}

(* A step that reads the clock happens at the time of the previous such step or later. Only the order of times *)
(* matters, so the clock moves in steps of one and only when a step reads it.                                  *)
Stamp == clock' \in {clock, clock + 1} \cap 0..MaxClock

(* server-imports.ts startServerImport -> jobs.ts startImportJob: started_at = now(); one running job per source *)
StartServerJob(j) ==
  /\ jobs[j].phase = "idle"
  /\ j = "J2" => jobs["J1"].phase # "idle"
  /\ RunningOf("lxns") = {}
  /\ Stamp
  /\ jobs' = [jobs EXCEPT ![j].kind = "server", ![j].phase = "running", ![j].startedAt = clock']
  /\ UNCHANGED <<rec, saveRev, del, replace, manualDone, delLockedAt, lastShortCircuit, lastRevival>>

(* merge.ts completeImportJob, under the lock; finishImportJob sets finished_at *)
CompleteServerJob(j) ==
  /\ jobs[j].phase = "running"
  /\ Stamp
  /\ \E previous \in PreviousChoices(j) :
       /\ RunMerge(j, previous)
       /\ jobs' = [jobs EXCEPT ![j].phase = "succeeded", ![j].finishedAt = clock',
                    ![j].saveRevision = IF Reusable(j, previous, Bug_20fd1229) THEN saveRev' ELSE None]
  /\ UNCHANGED <<del, replace, manualDone, delLockedAt>>

(* client-imports.ts applyClientImportChunk, one chunk: its transaction begins; now() is the job's started_at *)
BeginClientChunk(j) ==
  /\ jobs[j].phase = "idle"
  /\ j = "J2" => jobs["J1"].phase # "idle"
  /\ Stamp
  /\ jobs' = [jobs EXCEPT ![j].kind = "client", ![j].phase = "begun", ![j].beganAt = clock', ![j].startedAt = clock']
  /\ UNCHANGED <<rec, saveRev, del, replace, manualDone, delLockedAt, lastShortCircuit, lastRevival>>

(* applyClientImportChunk under the lock: startImportJob, the short-circuit or merge, and chunks.timeBound *)
ApplyClientChunk(j) ==
  /\ jobs[j].phase = "begun"
  /\ RunningOf(SourceOf(j)) = {}
  /\ \E previous \in PreviousChoices(j) :
       /\ RunMerge(j, previous)
       /\ jobs' = [jobs EXCEPT ![j].phase = "succeeded", ![j].finishedAt = jobs[j].beganAt,
                    ![j].saveRevision = IF Reusable(j, previous, Bug_b4850bef) THEN saveRev' ELSE None]
  /\ UNCHANGED <<clock, del, replace, manualDone, delLockedAt>>

(* mutations.ts applyMutations: the transaction of a delete begins *)
BeginDelete ==
  /\ del.phase = "idle"
  /\ Stamp
  /\ del' = [phase |-> "begun", beganAt |-> clock']
  /\ UNCHANGED <<rec, saveRev, jobs, replace, manualDone, delLockedAt, lastShortCircuit, lastRevival>>

(* applyMutations under the lock: decideManualMutation 'delete'; RecordWriter dates it save.now (saves.ts lockSave) *)
LockedDelete ==
  /\ del.phase = "begun"
  /\ Stamp
  /\ del' = [del EXCEPT !.phase = "done"]
  /\ IF Live(rec)
     THEN /\ rec' = [rec EXCEPT !.deletedAt = IF Bug_0d12d685_LockTime THEN del.beganAt ELSE clock']
          /\ saveRev' = saveRev + 1
          /\ delLockedAt' = clock'
     ELSE UNCHANGED <<rec, saveRev, delLockedAt>>
  /\ UNCHANGED <<jobs, replace, manualDone, lastShortCircuit, lastRevival>>

(* applyMutations under the lock: decideManualMutation 'set' with manualVerification; a manual set clears dxScore *)
ManualSet ==
  /\ ~manualDone
  /\ manualDone' = TRUE
  /\ IF Live(rec) /\ rec.ach = ManualValue
     THEN UNCHANGED <<rec, saveRev>>
     ELSE /\ rec' = [present |-> TRUE, ach |-> ManualValue, dx |-> FALSE,
                     verification |-> IF Live(rec) /\ (rec.source # "manual" \/ rec.verification = "user_edited")
                                      THEN "user_edited" ELSE "client_reported",
                     source |-> "manual", deletedAt |-> None]
          /\ saveRev' = saveRev + 1
  /\ UNCHANGED <<clock, jobs, del, replace, delLockedAt, lastShortCircuit, lastRevival>>

(***************************************************************************)
(* cleanup.ts runCloudSaveCleanup step 1 (purgeTombstones): deletes a      *)
(* tombstone older than the retention and drops counts.saveRevision from   *)
(* the save's succeeded jobs; the save's revision does not move.           *)
(* Assumption: the 90-day retention far outlasts the 15-minute job         *)
(* abandonment (jobs.ts IMPORT_JOB_ABANDONED_AFTER_MS), so no job that     *)
(* started before the deletion is still running when its tombstone goes.  *)
(***************************************************************************)
PurgeTombstone ==
  /\ Tombstone(rec)
  /\ \A j \in Jobs : jobs[j].phase \in {"running", "begun"} => jobs[j].startedAt > delLockedAt
  /\ rec' = Absent
  /\ jobs' = IF Bug_d95f7c29 THEN jobs
             ELSE [j \in Jobs |-> IF jobs[j].phase = "succeeded" THEN [jobs[j] EXCEPT !.saveRevision = None] ELSE jobs[j]]
  /\ UNCHANGED <<clock, saveRev, del, replace, manualDone, delLockedAt, lastShortCircuit, lastRevival>>

(* replace.ts replaceRecords: the user sends ifRevision (the revision they saw) and the transaction begins *)
BeginReplace ==
  /\ replace.phase = "idle"
  /\ Stamp
  /\ replace' = [phase |-> "begun", ifRevision |-> saveRev]
  /\ jobs' = [jobs EXCEPT !["R"].phase = "begun", !["R"].beganAt = clock', !["R"].startedAt = clock']
  /\ UNCHANGED <<rec, saveRev, del, manualDone, delLockedAt, lastShortCircuit, lastRevival>>

(* replaceRecords under the lock: the best entry per chart becomes the row (client_reported), unless it is the same upload *)
LockedReplace ==
  /\ replace.phase = "begun"
  /\ RunningOf(SourceOf("R")) = {}
  /\ replace' = [replace EXCEPT !.phase = "done"]
  /\ IF replace.ifRevision # saveRev
     THEN /\ jobs' = [jobs EXCEPT !["R"].phase = "failed"]   \* RevisionPreconditionFailed rolls the job back
          /\ UNCHANGED <<rec, saveRev>>
     ELSE LET upload == Fresh(Head(PayloadOf("R")), "R")
              same == Live(rec) /\ rec.ach = upload.ach /\ rec.dx = upload.dx
                      /\ rec.verification = "client_reported" /\ rec.source = upload.source
          IN /\ rec' = IF same THEN rec ELSE upload
             /\ saveRev' = IF same THEN saveRev ELSE saveRev + 1
             /\ jobs' = [jobs EXCEPT !["R"].phase = "succeeded", !["R"].finishedAt = jobs["R"].beganAt,
                          !["R"].saveRevision = IF Bug_0d12d685_Replace THEN saveRev' ELSE None]
  /\ UNCHANGED <<clock, del, manualDone, delLockedAt, lastShortCircuit, lastRevival>>

Next ==
  \/ \E j \in AutoJobs : StartServerJob(j) \/ CompleteServerJob(j) \/ BeginClientChunk(j) \/ ApplyClientChunk(j)
  \/ BeginDelete \/ LockedDelete
  \/ ManualSet
  \/ PurgeTombstone
  \/ BeginReplace \/ LockedReplace

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* DeletionSticky: an automatic import never revives a deletion that took  *)
(* the save lock at or after the moment the import job started.            *)
(***************************************************************************)
DeletionSticky ==
  \A r \in lastRevival : r.deletionLockedAt < r.startedAt

(***************************************************************************)
(* ShortCircuitSound: when a job takes the short-circuit, the chart is     *)
(* exactly what the full merge of its payload would have left (value, DX   *)
(* score, verification, source, deleted or not).                           *)
(***************************************************************************)
ShortCircuitSound ==
  \A s \in lastShortCircuit : s.kept = s.merged

=============================================================================
