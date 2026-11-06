# Authorization proofs (gdp-ts)

The backend uses [gdp-ts](https://github.com/rauchg/gdp-ts) ("Ghosts of Departed Proofs") wherever a missed check
would be an incident. A sensitive function takes a *proof* about its exact (named) arguments, so calling it with a
raw id, another user's proof or no proof is a type error. The pattern and its limits are explained in the gdp-ts skill
(`npx skills add rauchg/gdp-ts`).

## Rules

- One file here per fact. Inside it: a private `defineProof`, an exported `interface X<...> extends Proof<...> {}`,
  and an exported function that runs the check and hands out the proof. Never export the prover.
- Never write `as` to get a proof or a `Named` value. The oxlint rules `gdp-ts/no-define-proof`,
  `gdp-ts/no-proof-assertion` and `gdp-ts/no-exported-prover` (root `.oxlintrc.json`) enforce this.
- Keep the SQL scoped too (`WHERE user_id = ...`). The constraint stops bad rows; the proof stops unchecked code paths.
- Each new mistake you nearly made goes into `src/test/gdp-mistakes.ts` as one `@ts-expect-error` line.

## Proofs

| Proof | Minted by | Demanded by |
|---|---|---|
| `ViewerIs<U>`: `U` is the signed-in user of this request | `withViewer(context.user, k)` | `services/lxns/viewer.ts` (every LXNS credential read or write) |

`services/lxns/index.ts` keeps the raw `userId: string` implementations. oxlint (`no-restricted-imports`) allows
imports of it only from `services/lxns/`, `app.ts` (the OAuth callback, which has no viewer yet) and tests.

## Where to stop

Name only the ids that cross a trust boundary and fetch or change something private: the viewer, an OAuth state, a
save, a job. Use one proof per policy. Product rules whose absence is not an incident (no reporting your own comment,
say) stay plain checks.
