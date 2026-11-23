# Guard replays

Each guard in this repo (a lint rule, a type, a test, a formal model) exists because someone made a mistake that reached a PR or production. A replay reintroduces that mistake and runs the guard. The guard must fail.

`pnpm guard:replays --only <id>` runs one replay. The CI gate runs the replays that need nothing, the backend integration job runs those that need `postgres`, and the formal models job runs those that need `tlc`. A guard that stops catching its mistake fails the build.

## Add a replay

1. Reintroduce the past mistake in today's code, in the smallest form that still shows it.
2. Save the change: `git diff --no-ext-diff > scripts/guard-replays/replays/<id>/replay.patch`, then restore the files.
3. Write `replays/<id>/replay.json`:

   | Field | Meaning |
   | --- | --- |
   | `mistake` | The mistake in one sentence. |
   | `history` | The PRs or commits where it happened. |
   | `guard` | The guard that catches it. |
   | `check` | The command that must fail. It runs with `sh -c` from the repo root. |
   | `expect` | Text that the failing output must contain, so an unrelated failure does not count. |
   | `needs` | Optional. Services the check needs, such as `postgres` or `tlc`. `pnpm guard:replays` runs only replays with no needs; `pnpm guard:replays --needs postgres` runs only those that need `postgres`, in the job that has it. |

4. Run `pnpm guard:replays --only <id>`.

## When a replay fails

- **No longer applies.** The code moved. Reintroduce the same mistake in the new code and regenerate the patch.
- **The guard let the mistake through.** The guard was weakened or removed. Restore it, or explain in the PR why the mistake is now impossible some other way and delete the replay.
