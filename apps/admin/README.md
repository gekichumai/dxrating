# admin

`@gekichumai/admin` is the private, client-rendered administrator application. It is a Vite SPA and is intentionally
separate from the public web application's rendering and presentation stack.

## Local development

From the repository root:

```sh
pnpm install
pnpm --filter @gekichumai/admin dev
```

The development server uses `http://localhost:5174` with `strictPort` enabled because the backend allowlists that exact
administrator origin. Useful package checks are:

```sh
pnpm --filter @gekichumai/admin typecheck
pnpm --filter @gekichumai/admin lint
pnpm --filter @gekichumai/admin test
pnpm --filter @gekichumai/admin build
```

There are no required public environment variables at this scaffold stage. `VITE_ADMIN_ENVIRONMENT` is an optional,
non-secret label for local or preview builds; it is ignored by the visible environment marker in production. Never put
credentials, Cloudflare Access assertions, session values, or other secrets in a `VITE_` variable because Vite embeds
those values into the browser bundle. The backend origin variable and private API client arrive in issue #311.

## Route layout

- `/sign-in` is outside the authenticated shell so authentication can remain a small, independently loaded route.
- `/` is the dashboard.
- `/charts`, `/comments`, `/users`, `/administrators`, and `/chart-reports` are typed, lazy top-level destinations.
- Unknown locations and render failures use dedicated recovery states.

The code-based route tree in `src/router.tsx` avoids generated-file drift while retaining compile-time link checking.
Every route component and the authenticated shell are loaded through dynamic imports.

Vite development and preview servers use SPA history fallback because `appType` is explicitly `spa`. A production
static host must apply the equivalent rule: serve a real asset when it exists and otherwise return `index.html` for an
HTML navigation request. Production hosting, edge caching, and its smoke tests are owned by issue #343.

## Interface rules

Mantine is the only component system in this package. Do not import MUI, Emotion components, UnoCSS, PostHog, public
web presentation components, or public web styles. Use Mantine components and CSS modules for admin-only layout and
polish. Keep user-visible text in `src/i18n.tsx`; adding a locale means adding a complete catalog, registering its
locale code, and selecting it through the same translation provider.

Desktop is the primary workflow. The supported scaffold checks are 1440×900 desktop and 768×1024 tablet portrait.
At tablet width the navigation collapses behind its labelled control, actions wrap, and page content owns any future
horizontal overflow. Wide data tables must eventually use a labelled, keyboard-focusable scroll region instead of
widening the document.
