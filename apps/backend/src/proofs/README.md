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
| `ViewerIs<U>`: `U` is the signed-in user of this request | `withViewer(context.viewer, k)` | `services/lxns/viewer.ts` (every LXNS credential read or write, and `lxns.complete`) |

`context.viewer` is a `SessionViewer`: a class with a `#private` field, exported as a type only, so neither an object
literal nor a spread copy with another `id` type-checks. Only `viewerFromSession` makes one, and oxlint
(`no-restricted-imports` with `importNames`) allows importing it in `app.ts` alone, where the request's session is read.

`Named` itself is structural, so a spread copy (`{ ...viewer, value: input.userId }`) still type-checks. The facade
therefore reads the id through `viewerId(viewer, proof)`, which accepts only the exact value `withViewer` handed out
(a module-private `WeakSet`) and throws otherwise (`src/test/viewer-is.test.ts`).

`services/lxns/index.ts` keeps the raw `userId: string` implementations. oxlint allows imports of it (any spelling:
`./lxns`, `./lxns/index`, `./lxns/index.ts`) only from `services/lxns/` and tests.

## Where to stop

Name only the ids that cross a trust boundary and fetch or change something private: the viewer, an OAuth state, a
save, a job. Use one proof per policy. Product rules whose absence is not an incident (no reporting your own comment,
say) stay plain checks.
