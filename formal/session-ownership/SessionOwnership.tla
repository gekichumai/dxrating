--------------------------- MODULE SessionOwnership ---------------------------
(*
 Which account the web's active cloud save, cached features and stored save
 selection belong to, while another tab signs a different account in.

 One tab of apps/web runs useActiveSaveDecision
 (apps/web/src/models/scores/ActiveSaveContext.tsx). The browser has one
 session cookie, shared by every tab; this tab learns of a change only when
 authClient.useSession() refetches. Requests carry the cookie of the moment
 they leave. Each action below names the code it stands for.

 Bug_<sha> constants switch one action back to its behaviour before that fix;
 SessionOwnership.cfg sets them all FALSE. A Finding_<name> constant set TRUE is
 today's code on a path where TLC finds a violation that is still open
 (.claude/skills/verify-session-ownership/SKILL.md). The .cfg sets them FALSE:
 the two ListSaves ones then model the fix the skill names, and
 Finding_FeaturesSwitchBack = FALSE assumes the session changes at most once
 while one features request is in flight.
*)
EXTENDS Naturals

CONSTANTS
  MaxSwitches,    \* session changes made in other tabs
  MaxSelections,  \* saves the user picks in the save selector
  MaxDeletes,     \* saves deleted from another device
  Bug_0d2a2e32,   \* an account switch keeps the previous account's repository until the next one opens
  Bug_945ce071,   \* render exposes cloudRepository without comparing its owner with the session
  Bug_61f5edfe,   \* fetchFeatures sends features.get with no session check around it
  Bug_cc07485f,   \* a late not-found clears the stored selection whatever save it names
  Finding_ListSavesUnbound,    \* listSaves uses the unbound privateApiClient
  Finding_ListClearsAnySave,   \* a save missing from the list clears the stored selection whatever save it names
  Finding_FeaturesSwitchBack   \* the session may change twice while one fetchFeatures is in flight

Users == {"a", "b"}
Saves == {"a1", "a2", "b1"}
SaveOwner == [s \in Saves |-> IF s = "b1" THEN "b" ELSE "a"]
None == "none"
NoRepo == [owner |-> None, save |-> None]
NoDecision == [user |-> None, step |-> "idle", save |-> None]
NoRequest == [phase |-> "idle", ans |-> None, sw |-> 0]
Repos == [owner : Users, save : Saves]

VARIABLES
  cookie,      \* the session cookie the server reads (Better Auth, shared by every tab)
  seen,        \* useSessionUserId() in this tab
  sel,         \* localStorage['active-save-id']: readActiveSaveId / writeActiveSaveId
  exists,      \* the saves the server has
  repo,        \* the cloudRepository state of useActiveSaveDecision
  flushing,    \* repositories whose dispose() still flushes their outbox
  eff,         \* the [userId, selectionVersion] the decision effect last ran for
  ver,         \* selectionVersion
  dec,         \* the decision the effect started and has not cancelled
  featCache,   \* sessionStorage['dxr-features:' + u]: whose features are stored under u
  req,         \* the fetchFeatures(u) in flight for u (userFeatures.ts memoryCache)
  switches, selections, deletes,
  wrongClear   \* the code cleared a selection that named a save its user still has

vars == <<cookie, seen, sel, exists, repo, flushing, eff, ver, dec, featCache, req,
          switches, selections, deletes, wrongClear>>

Init ==
  /\ cookie = "a"
  /\ seen = "a"
  /\ sel = [u \in Users |-> IF u = "a" THEN "a1" ELSE "b1"]
  /\ exists = Saves
  /\ repo = NoRepo
  /\ flushing = {}
  /\ eff = [user |-> "init", ver |-> 0]
  /\ ver = 0
  /\ dec = NoDecision
  /\ featCache = [u \in Users |-> None]
  /\ req = [u \in Users |-> NoRequest]
  /\ switches = 0 /\ selections = 0 /\ deletes = 0
  /\ wrongClear = FALSE

TypeOK ==
  /\ cookie \in Users \cup {None}
  /\ seen \in Users \cup {None}
  /\ sel \in [Users -> Saves \cup {None}]
  /\ exists \subseteq Saves
  /\ repo \in Repos \cup {NoRepo}
  /\ flushing \subseteq Repos
  /\ dec.step \in {"idle", "features", "waitFeatures", "list", "open"}
  /\ featCache \in [Users -> Users \cup {None}]
  /\ \A u \in Users : req[u].phase \in {"idle", "check1", "get", "check2"}
  /\ wrongClear \in BOOLEAN

----------------------------------------------------------------------------
(* Helpers *)

\* setCloudRepository(r); the [cloudRepository] effect's cleanup then calls dispose(), which flushes the old one
SetRepo(r) ==
  /\ repo' = r
  /\ flushing' = IF repo # NoRepo /\ repo # r THEN flushing \cup {repo} ELSE flushing

\* writeActiveSaveId(storage, userId, null)
ClearSel(u) ==
  /\ sel' = [sel EXCEPT ![u] = None]
  /\ wrongClear' = (wrongClear \/ sel[u] \in exists)

\* fallBackToLocal() at the end of a decision
FallBack == SetRepo(NoRepo) /\ dec' = NoDecision

\* What the server answers a CloudScoreRepository request: privateApiClientFor(owner) names its account
RepoAnswer(r) ==
  IF cookie = None THEN "unauthorized"
  ELSE IF cookie # r.owner THEN "mismatch"
  ELSE IF r.save \notin exists THEN "not-found"
  ELSE "ok"

\* onStopped in useActiveSaveDecision; r is the repository that stopped
OnStopped(r, reason) ==
  /\ IF reason = "not-found" /\ (Bug_cc07485f \/ sel[r.owner] = r.save)
       THEN ClearSel(r.owner) /\ featCache' = [u \in Users |-> None]  \* clearUserFeaturesCache()
       ELSE UNCHANGED <<sel, wrongClear, featCache>>

----------------------------------------------------------------------------
(* The decision effect: useActiveSaveDecision's useEffect on [userId, selectionVersion] *)

EffectRun ==
  /\ eff # [user |-> seen, ver |-> ver]
  /\ eff' = [user |-> seen, ver |-> ver]
  /\ IF seen = None
       THEN FallBack
       ELSE /\ IF repo # NoRepo /\ repo.owner # seen /\ ~Bug_0d2a2e32
                 THEN repo' = NoRepo /\ UNCHANGED flushing  \* previous.dispose({ flushTimeoutMs: 0 })
                 ELSE UNCHANGED <<repo, flushing>>
            /\ dec' = [user |-> seen, step |-> "features", save |-> None]
  /\ UNCHANGED <<cookie, seen, sel, exists, ver, featCache, req, switches, selections, deletes, wrongClear>>

\* getUserFeatures(userId, fetchFeatures) and what the decision does with the features (all users have cloud save)
DecFeatures ==
  LET u == dec.user IN
  /\ dec.step = "features"
  /\ IF featCache[u] # None
       THEN LET s == sel[u] IN
            IF s = None THEN FallBack /\ UNCHANGED req
            ELSE IF repo = [owner |-> u, save |-> s]
              THEN dec' = NoDecision /\ UNCHANGED <<repo, flushing, req>>
              ELSE dec' = [dec EXCEPT !.step = "list", !.save = s] /\ UNCHANGED <<repo, flushing, req>>
       ELSE /\ dec' = [dec EXCEPT !.step = "waitFeatures"]
            /\ req' = IF req[u].phase = "idle" THEN [req EXCEPT ![u] = [NoRequest EXCEPT !.phase = "check1"]] ELSE req
            /\ UNCHANGED <<repo, flushing>>
  /\ UNCHANGED <<cookie, seen, sel, exists, eff, ver, featCache, switches, selections, deletes, wrongClear>>

\* fetchFeatures(userId) in defaultActiveSaveDependencies: ensureSessionUser, features.get, ensureSessionUser.
\* A rejection resolves the waiting decision to FEATURES_OFF (fallBackToLocal) and caches nothing.
FeatFail(u) ==
  /\ req' = [req EXCEPT ![u] = NoRequest]
  /\ IF dec.user = u /\ dec.step = "waitFeatures" THEN FallBack ELSE UNCHANGED <<repo, flushing, dec>>
  /\ UNCHANGED featCache

FeatCheck1(u) ==
  /\ req[u].phase = "check1"
  /\ IF Bug_61f5edfe \/ cookie = u
       THEN req' = [req EXCEPT ![u].phase = "get"] /\ UNCHANGED <<repo, flushing, dec, featCache>>
       ELSE FeatFail(u)
  /\ UNCHANGED <<cookie, seen, sel, exists, eff, ver, switches, selections, deletes, wrongClear>>

FeatGet(u) ==
  /\ req[u].phase = "get"
  /\ IF cookie # None
       THEN req' = [req EXCEPT ![u].phase = "check2", ![u].ans = cookie] /\ UNCHANGED <<repo, flushing, dec, featCache>>
       ELSE FeatFail(u)
  /\ UNCHANGED <<cookie, seen, sel, exists, eff, ver, switches, selections, deletes, wrongClear>>

\* getUserFeatures stores the answer under the account that asked, whether or not the decision was cancelled
FeatCheck2(u) ==
  /\ req[u].phase = "check2"
  /\ IF Bug_61f5edfe \/ cookie = u
       THEN /\ featCache' = [featCache EXCEPT ![u] = req[u].ans]
            /\ req' = [req EXCEPT ![u] = NoRequest]
            /\ dec' = IF dec.user = u /\ dec.step = "waitFeatures" THEN [dec EXCEPT !.step = "features"] ELSE dec
            /\ UNCHANGED <<repo, flushing>>
       ELSE FeatFail(u)
  /\ UNCHANGED <<cookie, seen, sel, exists, eff, ver, switches, selections, deletes, wrongClear>>

\* dependencies.listSaves(), then the check that the chosen save is in the list
DecList ==
  LET u == dec.user IN
  /\ dec.step = "list"
  /\ IF cookie = None \/ (~Finding_ListSavesUnbound /\ cookie # u)
       THEN FallBack /\ UNCHANGED <<sel, wrongClear>>
       ELSE IF dec.save \in {s \in exists : SaveOwner[s] = cookie}
         THEN dec' = [dec EXCEPT !.step = "open"] /\ UNCHANGED <<repo, flushing, sel, wrongClear>>
         ELSE /\ IF Finding_ListClearsAnySave \/ sel[u] = dec.save
                   THEN ClearSel(u)
                   ELSE UNCHANGED <<sel, wrongClear>>
              /\ FallBack
  /\ UNCHANGED <<cookie, seen, exists, eff, ver, featCache, req, switches, selections, deletes>>

\* dependencies.openCloudRepository(...), repository.start(), setCloudRepository(repository)
DecOpen ==
  /\ dec.step = "open"
  /\ SetRepo([owner |-> dec.user, save |-> dec.save])
  /\ dec' = NoDecision
  /\ UNCHANGED <<cookie, seen, sel, exists, eff, ver, featCache, req, switches, selections, deletes, wrongClear>>

----------------------------------------------------------------------------
(* CloudScoreRepository: handleFailure -> onStopped (404 not-found, 401 unauthorized); 409 only retries *)

\* The active repository stops: setCloudRepository((current) => (current === opened ? null : current))
RepoStops ==
  /\ repo # NoRepo
  /\ RepoAnswer(repo) \in {"not-found", "unauthorized"}
  /\ OnStopped(repo, RepoAnswer(repo))
  /\ SetRepo(NoRepo)
  /\ UNCHANGED <<cookie, seen, exists, eff, ver, dec, req, switches, selections, deletes>>

\* dispose() flushes the outbox first; a failure during the flush still reaches onStopped
FlushStops(r) ==
  /\ RepoAnswer(r) \in {"not-found", "unauthorized"}
  /\ OnStopped(r, RepoAnswer(r))
  /\ flushing' = flushing \ {r}
  /\ repo' = IF repo = r THEN NoRepo ELSE repo
  /\ UNCHANGED <<cookie, seen, exists, eff, ver, dec, req, switches, selections, deletes>>

FlushEnds(r) ==
  /\ flushing' = flushing \ {r}
  /\ UNCHANGED <<cookie, seen, sel, exists, repo, eff, ver, dec, featCache, req, switches, selections, deletes, wrongClear>>

----------------------------------------------------------------------------
(* The world: other tabs, other devices, the user *)

\* Another tab signs an account in, or signs out
SwitchSession(u) ==
  /\ switches < MaxSwitches
  /\ u # cookie
  /\ Finding_FeaturesSwitchBack \/ \A v \in Users : req[v].sw = 0
  /\ cookie' = u
  /\ switches' = switches + 1
  /\ req' = [v \in Users |-> IF req[v].phase = "idle" THEN req[v] ELSE [req[v] EXCEPT !.sw = @ + 1]]
  /\ UNCHANGED <<seen, sel, exists, repo, flushing, eff, ver, dec, featCache, selections, deletes, wrongClear>>

\* authClient.useSession() refetches and this tab renders with the new user
SessionRefresh ==
  /\ seen # cookie
  /\ seen' = cookie
  /\ UNCHANGED <<cookie, sel, exists, repo, flushing, eff, ver, dec, featCache, req, switches, selections, deletes, wrongClear>>

\* setActiveSaveId(saveId): the save selector, CloudSaveSection, or the migration's onActivate (after an await)
SelectSave(s) ==
  /\ selections < MaxSelections
  /\ seen # None
  /\ SaveOwner[s] = seen
  /\ s \in exists
  /\ s # sel[seen]
  /\ sel' = [sel EXCEPT ![seen] = s]
  /\ ver' = ver + 1
  /\ selections' = selections + 1
  /\ UNCHANGED <<cookie, seen, exists, repo, flushing, eff, dec, featCache, req, switches, deletes, wrongClear>>

DeleteSave(s) ==
  /\ deletes < MaxDeletes
  /\ s \in exists
  /\ exists' = exists \ {s}
  /\ deletes' = deletes + 1
  /\ UNCHANGED <<cookie, seen, sel, repo, flushing, eff, ver, dec, featCache, req, switches, selections, wrongClear>>

Next ==
  \/ EffectRun \/ DecFeatures \/ DecList \/ DecOpen \/ RepoStops
  \/ \E u \in Users : FeatCheck1(u) \/ FeatGet(u) \/ FeatCheck2(u)
  \/ \E r \in flushing : FlushStops(r) \/ FlushEnds(r)
  \/ \E u \in Users \cup {None} : SwitchSession(u)
  \/ SessionRefresh
  \/ \E s \in Saves : SelectSave(s) \/ DeleteSave(s)

Spec == Init /\ [][Next]_vars

----------------------------------------------------------------------------
(* Properties *)

\* exposedRepository in useActiveSaveDecision: what this render hands to the calculator
Exposed ==
  IF Bug_945ce071 THEN repo
  ELSE IF repo # NoRepo /\ seen # None /\ repo.owner = seen THEN repo
  ELSE NoRepo

\* The calculator never reads or queues changes in another account's save
ExposedOwner == Exposed = NoRepo \/ Exposed.owner = seen

\* Once the decision has run for the signed-in account, no other account's repository is still the active one
RepositoryDroppedOnSwitch ==
  (eff.user = seen /\ seen \in Users) => (repo = NoRepo \/ repo.owner = seen)

\* The features stored under an account are that account's
FeaturesHonest == \A u \in Users : featCache[u] \in {None, u}

\* A stored selection is cleared only when its save is gone
SelectionClearedOnlyWhenGone == ~wrongClear

=============================================================================
