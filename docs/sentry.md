# Sentry releases and source context

| Application | Sentry project | Release | Environment |
| --- | --- | --- | --- |
| Backend | `dxrating-backend` | `dxrating-backend@<full Git SHA>` | `production` |
| Web | `dxrating-web` | `dxrating@<version tag>` | `production` |
| Web preview | `dxrating-web` | `dxrating@pr-<number>+<head SHA>` | `preview` |

## Release pipeline

The backend Docker image sets `SENTRY_RELEASE` from the same `GIT_COMMIT` used by
its `/version` endpoint. CI creates the release and associates commits before
triggering Coolify. It records a production deployment only after `/version`
returns the expected commit.

The web's Sentry Vite plugin injects the release into both browser and server
bundles, uploads source maps to `dxrating-web`, and associates commits. Runtime
initialization must not override that injected release. CI uses full Git history
and forces builds so a Turbo cache hit cannot skip uploads. Turbo passes the
`SENTRY_AUTH_TOKEN` secret through without exposing it to browser code. The deploy
record is created only after Wrangler succeeds.

Keep the GitHub `SENTRY_AUTH_TOKEN` secret authorized for both projects and release
management. Authentication or upload failures should fail the deployment build.

## Source snippets

The backend runs Node with `--enable-source-maps`. Node resolves bundle frames to
TypeScript paths; Sentry's default `ContextLines` integration reads those files
from the container. The final image therefore includes `apps/backend/src` from
the builder as well as `dist`. Workspace package sources are already copied into
the image, and the renderer emits source maps. Removing source files breaks code
snippets even when file names and line numbers remain readable.

Web builds produce hidden source maps, upload them before deployment, and remove
the maps from `dist` afterward. Debug IDs identify the exact emitted artifacts.

Run `pnpm --filter @gekichumai/backend test:source-context` to reproduce the
missing-source behavior and verify mapped frames contain surrounding code once
sources are available. This test does not send an event to Sentry.

After deployment, verify a **new** event's release, environment, source context,
associated commits, and deployment in Sentry. Existing events do not gain missing
source context retroactively. Use a tagged, caught diagnostic error when testing;
there is no public endpoint for deliberately crashing the application.
