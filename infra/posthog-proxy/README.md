# posthog-proxy

Cloudflare Worker `posthog-proxy` (account GalvinGao) that serves `razu.dxrating.net`, the first-party PostHog proxy used by the web app (`apps/web/src/setup/init-client.ts`) and the iOS app (`PostHogAnalyticsBackend.host`).

`worker.js` is the deployed script. The Worker's route and settings live in Cloudflare and aren't managed from here. Upload a new version without touching them:

```sh
pnpm dlx wrangler versions upload --name posthog-proxy infra/posthog-proxy/worker.js
pnpm dlx wrangler versions deploy --name posthog-proxy <version-id>@100%
```

Tests (Node, no install needed):

```sh
node --test infra/posthog-proxy/worker.test.js
```
