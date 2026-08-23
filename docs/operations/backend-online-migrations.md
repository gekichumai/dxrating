# Backend online migration runbook

This runbook is the release and incident procedure for DXRating backend database changes. Its goal is to keep traffic-serving processes independent from schema changes and to preserve a tested code-rollback window. It applies to administrator features and every other change that touches live PostgreSQL data.

The default is forward-only, online delivery. No schema step should intentionally require the backend to be unavailable. This is a database-compatibility guarantee, not a claim that the deployment platform performs overlapping or rolling container replacement. Do not run migrations from a server startup hook, edit generated Drizzle SQL, or automatically reverse a destructive schema change.

## Delivery invariants

- The backend process only serves traffic. It never applies migrations while starting.
- On a normal rollout, CI builds once, identifies the image by its registry digest, rehearses that digest, runs it as a finite migration job, and deploys that same digest as the backend. A tag is only a lookup alias and is never a release identity.
- The migration job uses `MIGRATION_DATABASE_URL`; the backend uses a distinct, least-privilege `DATABASE_URL`. The migration URL must provide a direct, session-stable PostgreSQL connection because the advisory lock belongs to one session; do not route it through transaction-pooled PgBouncer or another transaction-level pooler. Never give the traffic-serving role schema-owner, DDL, role-management, or cluster-superuser privileges.
- The migration job holds the repository-owned PostgreSQL advisory lock for generated and reviewed non-transactional operations. Lock timeout, schema mismatch, failed verification, interruption, and SQL failure all fail the job and block the rollout.
- Expansion is backward compatible with the currently deployed backend. New code tolerates an incomplete backfill. Contract changes are released separately, after validation and the code-rollback window has closed.
- Generated SQL in `apps/backend/drizzle/` remains generated. Reviewed operations that PostgreSQL cannot run in a transaction live in `apps/backend/non-transactional-migrations/`.
- A backfill processes a fixed high-water mark in deterministic keyset order, commits bounded batches with its checkpoint, and can be stopped between batches.
- Migration and backfill logs may contain stable operation identifiers, row counts, checkpoints, and durations. They must not contain connection strings, credentials, row bodies, comments, email addresses, or other user data.

## Responsibilities

Every release that changes the schema names these responsibilities in its change record. One person may perform more than one role, but the checks remain distinct.

| Responsibility | Required outcome |
| --- | --- |
| Change author | Defines expansion, mixed-version reads and writes, backfill, validation, contract, and rollback boundary. |
| Migration reviewer | Reviews generated journal changes, non-transactional digests and postconditions, lock risk, and retry behavior. |
| Release operator | Verifies the target and backup, runs the one-shot job, observes locks and errors, and records results. |
| Application operator | Rolls the backend only after migration success and verifies old/new mixed-version behavior. |
| Contract approver | Confirms backfill and validation evidence, no old instances or queued jobs remain, and the prior build is no longer required for rollback. |

## Production execution boundary

The production migration job runs before the traffic deployment on a narrowly labelled, database-reachable self-hosted runner in the protected `dxrating (Production)` GitHub environment. The runner does not check out repository source. It pulls the digest produced by the build job and gives that container only `MIGRATION_DATABASE_URL` and the bounded migration timeout variables. The old backend remains live for the entire migration. A non-zero or interrupted job prevents the traffic deployment job from starting.

Treat that runner as production database infrastructure: restrict who can register or administer it, keep its Docker daemon and network private, use an ephemeral runner where possible, scope the database credential to migrations, and prevent untrusted pull-request code from selecting it. The `dxrating-production-migrations` label, `MIGRATION_DATABASE_URL` environment secret, and `DATABASE_DOCKER_NETWORK` protected environment variable must exist before enabling the workflow. The runner must use the Docker daemon that owns that external network. A missing runner, credential, network, or secret is a blocked release, not permission to move migration execution into application startup.

The current traffic deployment uses Coolify, but the sequencing rule is platform-neutral: the exact rehearsed migration process must finish while old traffic is still served, and only its exit status may unlock replacement of traffic-serving processes. A detached one-shot container is not a gate unless the platform actually waits for and propagates its exit status.

## Expand, backfill, validate, contract

Treat these as separate operational stages. Expansion and contract normally belong to different releases.

### 1. Expand

Add only structures that the currently deployed backend can ignore or safely use:

- nullable columns;
- columns with safe, constant defaults that do not rewrite the table;
- new tables;
- unvalidated constraints when they do not reject writes from the old build;
- concurrently built indexes through the reviewed non-transactional path.

Do not rename or drop a column, tighten nullability, change existing value semantics, or add a constraint that old writes cannot satisfy. Generated migration SQL must come from Drizzle and must not be hand-edited to make an unsafe change appear online-safe.

Before releasing the new backend, read the currently serving build identity from production and prove that exact deployed digest still starts and exercises both a database-backed read and write after expansion. A merely published image or rebuilt old source is not equivalent evidence.

### 2. Deploy compatible code

The new backend must tolerate both pre-backfill and backfilled rows. Typical patterns are a fallback read from the old representation and a dual write to both representations. Keep those compatibility paths until the contract release.

If an old worker, scheduled task, or queue consumer can still write the old shape, it counts as an old application instance.

### 3. Backfill

Implement each domain backfill as a small wrapper around `apps/backend/src/db/backfill-runner.ts`. The wrapper owns the domain query and update; the shared runner owns checkpoints and bounded transactions. A production backfill wrapper must define:

- a stable, non-sensitive identifier;
- a SHA-256 definition hash covering selection, cursor ordering, and mutation semantics;
- a unique deterministic cursor, normally a primary key or a stable compound key;
- a high-water-mark query captured once, so rows created later do not move the finish line;
- a keyset batch query ordered strictly after the checkpoint and at or below the high-water mark;
- an idempotent mutation that runs on the supplied transaction client;
- a conservative batch size, bounded `lockTimeoutMs` and `statementTimeoutMs`, pause control, rate/lag monitoring, and a domain validation query.

The row mutation and checkpoint advance commit in the same bounded transaction. The runner applies local lock and statement timeouts to checkpoint initialization and every batch (defaults: 5 seconds and 2 minutes); production wrappers must choose reviewed values appropriate to their queries. Do not use offset pagination, one transaction for the entire population, a cursor that is not unique, or a changing high-water mark. A definition change requires a new reviewed hash; the runner intentionally rejects a changed definition against an existing checkpoint.

Exercise pause, failure, restart, concurrent-worker serialization, and completion in tests before operating on live data. Start with a small batch, observe transaction time and replication lag, then increase only within the reviewed limit. Cancellation is expected between batches; a killed database connection rolls back the active batch and leaves the prior checkpoint retryable.

### 4. Validate

Validation is read-only until the intentional contract step. Record at least:

- total eligible rows at the fixed high-water mark;
- processed count and persisted checkpoint;
- zero missing target values in the eligible set;
- zero invalid or duplicate derived values;
- domain invariants and referential checks;
- query plans and index validity for the new access path;
- successful reads and writes from the new build;
- successful database-backed read and write probes from the currently deployed, digest-pinned image.

Do not infer completion from a process exit or log line alone. Compare the checkpoint with the domain validation queries.

### 5. Contract

Contract begins when a database change can make the previous build fail. It requires a separate approval and release. Before contract:

1. Confirm all backfills and validation queries are complete.
2. Confirm every traffic-serving instance, worker, scheduled task, and queue consumer uses the compatible new build.
3. Confirm no rollback to the previous build is required; rollbacks after this point go to the compatible build, not across the contract boundary.
4. Take or verify the contract-stage backup and restore rehearsal.
5. Apply constraints using online PostgreSQL patterns. For example, add and validate a check constraint before using it to support a short metadata-only `SET NOT NULL` operation.
6. Remove compatibility columns or tables only in a later change after retention and rollback requirements permit it.

## Authoring migration files

Generate transactional schema migrations with Drizzle and commit the SQL and journal metadata together:

```bash
cd apps/backend
pnpm drizzle-kit generate
```

Review the generated lock level and expected table scan. Never edit a committed generated SQL file or its journal timestamp. A correction is a new migration.

For `CREATE INDEX CONCURRENTLY` and another operation PostgreSQL forbids inside the generated migration transaction:

1. Add exactly one idempotent SQL statement to `apps/backend/non-transactional-migrations/`.
2. Add exactly one read-only verification query that returns one row with `verified = true`.
3. Have the verifier check the full intended object. A concurrent index verifier checks its table, keys or expression, predicate, uniqueness, `pg_index.indisready`, and `pg_index.indisvalid`.
4. Record both reviewed SHA-256 digests in the ordered manifest.
5. Review and test the crash window where the operation succeeds but ledger insertion does not. Retrying must verify the object and then record the operation without changing its meaning.

Never change a digest after an operation has run. The job hashes both files even when the ledger says an operation is already applied, and it reruns the postcondition before treating that entry as current.

Generated Drizzle migrations always run as a complete journal before the ordered non-transactional manifest. A non-transactional operation may depend on the generated journal, but generated migrations must not depend on a concurrent or other non-transactional operation. Use another reviewed non-transactional entry or a later release for that dependency. The applied non-transactional ledger must be an exact prefix of the manifest; an unknown entry or historical hole fails closed as an incident.

## Release checklist

### Before the migration job

- [ ] Confirm the build, rehearsal, production migration, and traffic deployment all name the same `sha256:…` digest; do not approve a tag-only release.
- [ ] Review the generated journal diff and every non-transactional operation, digest, and verifier.
- [ ] Confirm the change is expansion-only for this release and identify the exact contract boundary.
- [ ] Run the migration rehearsal CI job, including pause/resume and old/new mixed-version probes.
- [ ] Estimate table scans, index build space, transaction duration, WAL volume, and replication impact.
- [ ] Confirm a current backup exists and that a restore has been rehearsed in an isolated database.
- [ ] Record the normal migration timeout, abort criteria, rollback build, and responsible operator.
- [ ] Check for long-running transactions, blocked DDL, unhealthy replicas, and an existing migration job.
- [ ] Confirm the migration credential owns the application schemas and the backend credential has only the reviewed runtime grants. Test both connections independently.

Use a libpq service or another secret manager for database authentication. The following examples intentionally contain no connection string:

```bash
export PGSERVICE=dxrating-operator
export BACKUP_PATH="/restricted/encrypted-backups/backend-before-expand-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --file="$BACKUP_PATH"
pg_restore --list "$BACKUP_PATH" >/dev/null
```

Create the backup directory outside the repository with access restricted to the database operators. Use encrypted storage and encrypted transport, never attach the dump to an issue or CI artifact, and record its retention and deletion deadline. Listing an archive is an integrity check, not a restore rehearsal. Restore the archive into an isolated database, run application and domain checks there, record its duration, and securely delete both the restored copy and dump when the retention policy permits.

### Preflight queries

Run these with a read-only operator connection before starting the job:

```sql
SELECT current_database(), current_user, current_setting('server_version');

SELECT pid,
       application_name,
       state,
       wait_event_type,
       wait_event,
       clock_timestamp() - xact_start AS transaction_age
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;

SELECT activity.pid,
       activity.application_name,
       activity.state,
       locks.granted,
       activity.wait_event_type,
       activity.wait_event
FROM pg_locks AS locks
JOIN pg_stat_activity AS activity ON activity.pid = locks.pid
WHERE locks.locktype = 'advisory'
  AND locks.objsubid = 1
  AND ((locks.classid::bigint << 32) + locks.objid::bigint) = 7146402031193107721;
```

The advisory-lock query is observational. Do not use `pg_try_advisory_lock` as a health probe: it acquires the lock in that session and can create the contention it is trying to diagnose.

### Run and observe

The compiled, finite command is:

```bash
cd apps/backend
node --enable-source-maps --experimental-transform-types dist/migrate.js
```

The protected CI job runs this command directly from `ghcr.io/gekichumai/dxrating/backend@sha256:…`. It receives only `MIGRATION_DATABASE_URL`; the backend receives only the separate least-privilege `DATABASE_URL`. The job first verifies that the protected external Docker network exists and that the exact image can connect through it with the migration credential. Provision the network, roles, and grants before using the example configuration. Success is exit code 0 plus the postconditions and ledgers.

A normal GitHub cancellation sends the container a bounded stop signal; the migration runner destroys its database session, PostgreSQL rolls back an active transaction, and the advisory lock becomes available to a retry. A hard runner or Docker-daemon failure can bypass shell traps. The job therefore uses one reserved, labelled container name and stops a matching orphan before a retry. It refuses to remove an unrelated container that occupies that name. Keep this job on one controlled Docker daemon; if that daemon was lost, inspect PostgreSQL activity and the advisory lock before retrying. A retry still fails closed on the advisory-lock timeout if an unreachable orphan is active.

`docker-compose.prod.yml` intentionally contains only PostgreSQL and traffic. It never receives the migration credential and cannot extend a traffic replacement outage by running DDL. `docker-compose.migrate.yml` is an explicit operator overlay for a foreground, digest-pinned one-shot invocation. Resolve both files before starting anything:

```bash
cd apps/backend
docker compose --env-file .env.production -f docker-compose.prod.yml config --images
docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.migrate.yml config --images
```

The traffic definition must show `backend@<BACKEND_IMAGE_DIGEST>`. The combined definition must additionally show `backend@<MIGRATION_IMAGE_DIGEST>`. For a normal release both digest values are identical to the successful build output. Abort if either value is a tag, placeholder, malformed digest, or differs unexpectedly.

The Compose definitions pass only PostgreSQL bootstrap settings to the database, only database and migration settings to the one-shot job, and only application settings to the backend. PostgreSQL, traffic, and the one-shot overlay share the stable external network named by `DATABASE_DOCKER_NETWORK`; create that network before the first deployment. The protected runner uses the same name and Docker daemon. Runtime `.env` files are excluded from source control and the Docker build context; never copy one into an image or remote build cache.

When operating Compose directly, run and verify the foreground migration while the existing traffic stack remains up. Only then replace traffic:

```bash
cd apps/backend
docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.migrate.yml pull migrate
docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.migrate.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps --all
```

Do not deploy the backend after a failed or unobserved migration command. The job emits structured identifiers and durations. Check the generated and non-transactional ledgers after it succeeds:

```sql
SELECT id, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;

SELECT id, applied_at, duration_ms
FROM drizzle.__dxrating_non_transactional_migrations
ORDER BY id;
```

### Current Coolify traffic deployment

Complete this one-time transition before enabling the production workflow: create the stable external database network; point the Coolify application at `apps/backend/docker-compose.prod.yml`; enable **Raw Compose Deployment**; disable native Git auto-deploy; configure every required Compose value; provision the separate runtime and migration database roles; and run a no-change deployment plus health, version, and database-read checks. Existing PostgreSQL data must stay on its current named volume. Do not recreate or rename that volume during this transition.

Standard Compose mode injects a shared `.env` into every service and defeats the file's credential allowlists. Coolify also stops the current Compose stack before `up -d`, which is why the migration job must run independently first. Keep the Coolify deployment API token as the single automation writer; do not start a competing manual deployment while CI is between pinning and queueing. Create a team-scoped token with only `read`, `write`, and `deploy` abilities. The workflow does not require `read:sensitive`: environment values may remain redacted. Store that token and the access-client credentials only as protected environment secrets.

After the migration exits 0, CI updates the Coolify `BACKEND_IMAGE_DIGEST` build-and-runtime value and pins `git_commit_sha` to the full workflow SHA. The digest must be available during Coolify's pre-stop Compose parsing as well as runtime startup. CI verifies the non-sensitive variable metadata and exact source commit, rejects a pre-existing active deployment, then queues with `POST /deploy`. The deployed `/version` response is the final proof that Coolify retained the exact digest; no secret-reading permission is needed.

CI parses the returned deployment UUID and polls it to a terminal state, requiring `finished` and the exact queued commit. Because a successful detached Compose command is not application readiness, the same monitored script then requires public `/health`, exact `/version` commit and digest, and a database-backed `/api/v1/tags` read before mutable registry aliases are promoted.

On timeout, API failure, unknown status, or normal runner cancellation after queueing, an exit trap discovers the attempted deployment if necessary, requests cancellation, and polls until it proves a terminal cancelled/failed state or proves that an already-finished deployment has the expected healthy identity. A hard runner loss or prolonged Coolify/API outage can prevent reconciliation. In that case the workflow logs the application or deployment identifier and fails: inspect that deployment in Coolify, cancel it if it is still active, or verify the finished release's health, source, digest, and database read. Roll back to the recorded prior digest when those checks fail. Do not promote aliases or begin another release until the deployment is terminal and reconciled.

The workflow derives the API base and application UUID from the protected `COOLIFY_WEBHOOK_URL` secret. Its preflight fails closed unless the application points at `apps/backend/docker-compose.prod.yml`, Raw Compose is enabled, and native auto-deploy is disabled. HTTP failures, malformed API responses, unknown deployment states, timeouts, source mismatches, digest mismatches, failed database reads, and unhealthy traffic all fail the release.

`POSTGRES_USER` remains `dxrating` in the example because changing bootstrap variables does not rename a role in an initialized PostgreSQL volume. Before switching `MIGRATION_DATABASE_URL` and `DATABASE_URL` to dedicated logins, provision them against the existing volume in a separately reviewed maintenance step: retain the existing owner or a no-login owner role for schema objects, grant the migrator the required ownership/DDL capability, grant the runtime role only connect/schema usage and required DML/sequence privileges, configure matching default privileges for future objects, and test both connections. Never assume editing `.env.production` modifies roles in an existing database.

Abort the rollout and investigate when any of these occur:

- the advisory lock reaches its bounded timeout;
- DDL waits beyond the reviewed SQL lock timeout;
- an unreviewed long transaction or blocked query appears;
- a migration digest, journal, ledger, or postcondition check fails;
- a concurrent index is not ready and valid;
- replication lag, error rate, or database resource use crosses the recorded threshold;
- the operator cannot identify whether the expansion is safe for the previous build.

Interruption and failure return non-zero. Correct the cause and rerun the same immutable job. Do not delete or manufacture ledger rows to make it pass.

### After expansion and application rollout

- [ ] Confirm the migration service exited 0 and each expected identifier is in its ledger.
- [ ] Confirm `/health` succeeds on every new backend instance.
- [ ] Exercise at least one database-backed read and one write for affected behavior.
- [ ] Confirm old-format and new-format rows both work while the backfill is incomplete.
- [ ] Start the backfill at its reviewed batch size and watch checkpoint progress, transaction age, locks, replication lag, and application errors.
- [ ] Pause and resume once before increasing throughput.
- [ ] Run independent domain validation and retain the results with the release record.
- [ ] Probe the digest-pinned currently deployed backend image before approving contract.

## Legacy Drizzle ledger reconciliation

Some historical databases may contain the verified result of generated migrations `0003`, `0004`, or `0008` while their Drizzle ledger reflects an older journal ordering or historical fingerprint. A normal invocation detects the narrowly recognized state and fails closed with `LegacyMigrationReconciliationRequiredError`. It never silently baselines an arbitrary schema.

After taking a backup, inspect the named migration, its generated SQL, the ledger, and the actual columns and constraints. If and only if the state is one of the recognized `0003`/`0004`/`0008` cases and the schema verifier succeeds, run the explicit one-shot opt-in:

```bash
cd apps/backend
node --enable-source-maps --experimental-transform-types dist/migrate.js --reconcile-legacy
```

For the production Compose image, run the same reviewed digest in the foreground without replacing traffic:

```bash
cd apps/backend
docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.migrate.yml run --rm migrate \
  node --enable-source-maps --experimental-transform-types dist/migrate.js --reconcile-legacy
```

The opt-in still holds the migration advisory lock. It either applies the exact recognized correction or records an already verified historical result, then continues the normal runner. It does not accept an unknown hash, incomplete table, unexpected constraint, existing application schema without a ledger, or a partially applied unrelated migration. Any such state is an incident: stop, preserve the database and logs, compare with the reviewed generated files, and prepare an explicit corrective migration.

An old local development or test volume may have application tables but no Drizzle ledger because earlier test setup created a hand-maintained subset. Do not baseline it. If the data is disposable, first confirm the target is only the local Compose PostgreSQL instance, then recreate that volume and apply the journal normally:

```bash
cd apps/backend
docker compose down --volumes
docker compose up -d postgres
pnpm migrate:dev
```

`docker compose down --volumes` permanently removes every database in that local Compose volume. Never use this reset procedure for a shared, staging, or production database. Preserve any needed local fixture data before resetting.

## Invalid concurrent index recovery

PostgreSQL can leave an invalid same-name index after an interrupted concurrent build. `CREATE INDEX CONCURRENTLY IF NOT EXISTS` does not repair it. The reviewed verifier therefore fails the job instead of recording success.

Inspect the object without changing it:

```sql
SELECT namespace.nspname AS schema_name,
       index_class.relname AS index_name,
       index_catalog.indisready,
       index_catalog.indisvalid,
       pg_get_indexdef(index_catalog.indexrelid) AS definition
FROM pg_index AS index_catalog
JOIN pg_class AS index_class ON index_class.oid = index_catalog.indexrelid
JOIN pg_namespace AS namespace ON namespace.oid = index_class.relnamespace
WHERE namespace.nspname = '<schema>'
  AND index_class.relname = '<index_name>';
```

Confirm the name and definition against the reviewed operation and verifier. Check sessions and blockers, then have the migration reviewer approve removal of only that invalid object:

```sql
DROP INDEX CONCURRENTLY IF EXISTS <schema>.<index_name>;
```

Run that command outside a transaction, confirm no valid application dependency was removed, and rerun the unchanged migration job. Never drop an index merely because the job timed out, and never mark the manifest entry applied by hand.

## Rollback boundaries

| Current stage | Supported response |
| --- | --- |
| Before expansion | Stop the job; an uncommitted transactional migration rolls back. Correct and retry. |
| Expansion applied, old build compatible | Roll application traffic back to the previous build. Leave additive schema in place. |
| Backfill partial | Stop between batches and roll application traffic back if old writes remain valid. Preserve the checkpoint; resume later. |
| Backfill complete, contract not started | Roll application traffic back to the previous build. Do not reverse the backfilled data automatically. |
| Contract started | Do not roll back across the declared contract boundary. Restore the compatible build or execute a separately reviewed forward fix. |
| Destructive data loss or corruption | Stop writes as directed by the incident owner and restore through the rehearsed backup procedure. Do not improvise an automatic down migration. |

An expansion migration may have committed even when a later non-transactional operation fails. That is expected: leave the compatible expansion in place, correct the failed operation, and retry. The ledger and postconditions determine what remains to run.

For a reviewed application rollback before contract, keep `MIGRATION_IMAGE_DIGEST` at the most recent successful migration digest and change only `BACKEND_IMAGE_DIGEST` to the previously verified compatible application digest. Do not rerun an older ledger-aware migration binary: it cannot recognize migrations introduced after it was built and must fail closed rather than bless an unknown ledger. The next normal rollout must again set both digest values to its one rehearsed build output.

## Post-migration record

Record the image digest or commit, migration identifiers, start/end times, lock wait, non-transactional verification, backfill definition hash and checkpoint totals, validation results, backup/restore rehearsal reference, application probes, and the declared contract boundary. Keep user data and credentials out of this record.

Only close the migration window after the compatible application is healthy, validation is complete, and monitoring remains normal for the agreed observation period.
