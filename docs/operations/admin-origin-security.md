# Administrator origin and session security

The administrator browser application and Better Auth share one validated origin policy. `ADMIN_FRONTEND_URL` is the primary administrator origin. `ADMIN_ADDITIONAL_TRUSTED_ORIGINS` is a JSON array of exact local or access-protected administrator preview origins. `PUBLIC_ADDITIONAL_TRUSTED_ORIGINS` separately lists ordinary public preview/development origins: those origins can use the ordinary browser API and authentication routes but never receive administrator-route CORS access. Origin patterns, URL credentials, paths, query strings, and fragments are rejected at startup.

Production requires HTTPS for the backend, public frontend, administrator frontend, and every additional browser origin. Development HTTP additions are accepted only for explicitly configured loopback origins.

## Browser requests

The administrator application must send `credentials: 'include'` for sign-in, session lookup, OAuth initiation and completion, administrator oRPC calls, and sign-out. Authentication and step-up values remain in HTTP-only cookies; clients must not copy them into local storage.

Session cookies are backend-host-only. Production cookies are `Secure`, `HttpOnly`, `SameSite=Lax`, and use `Path=/`. `SameSite=Lax` supports the HTTPS `admin.dxrating.net` to backend subdomain flow because it is same-site, while withholding the cookie from unrelated cross-site requests. Authenticated previews must therefore use an HTTPS DXRating subdomain or a same-origin proxy to a matching non-production backend. A cross-site `pages.dev` or `workers.dev` preview cannot use these cookies merely by adding a CORS entry.

State-changing administrator requests require an exact configured administrator `Origin` in addition to session and role authorization. Better Auth keeps its own origin and CSRF checks enabled. Authentication callback and return URLs are restricted to configured public/administrator origins; protocol downgrades, URL user information, lookalike hosts, and unrelated destinations are rejected.

Every `/api/admin` response, including preflight and error responses, is marked `Cache-Control: private, no-store` with matching CDN no-store directives. Public catalog CORS and caching remain separate and credential-independent.

Actual administrator API requests also require the independently validated Cloudflare Access assertion described in `admin-access-boundary.md`. CORS preflight is a transport exception and grants no application access by itself.

## Moving existing cookies to host-only scope

Older deployments issued the production session cookie with `Domain=dxrating.net`. During rollout, set `LEGACY_AUTH_COOKIE_DOMAIN=dxrating.net`. Whenever Better Auth creates, rotates, or deletes a session cookie, the backend also expires the old parent-domain cookie names while leaving the new host-only cookie intact. This prevents two same-name cookies from surviving a sign-in or sign-out response.

Keep the cleanup setting for at least one maximum session lifetime, verify that new authentication cookies have no `Domain` attribute, then remove it. Rolling back application code during that window remains safe because the session records and signed values are unchanged; users whose old cookie has been expired may need to sign in again after a rollback.
