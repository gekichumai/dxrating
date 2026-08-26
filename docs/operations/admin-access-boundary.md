# Administrator Access assertion boundary

Every non-`OPTIONS` request to `/api/admin` or a descendant must pass two independent checks:

1. a valid Cloudflare Access application assertion for an explicitly configured administrator application audience; and
2. a current DXRating session whose persisted effective role satisfies the administrator procedure policy.

The Access assertion is only proof that the outer policy admitted the request. Its email, subject, groups, custom claims, and other identity fields never create or change a DXRating role. Application authorization continues to use the Better Auth user ID and current server-side role policy.

## Application validation

Production uses `ADMIN_ACCESS_MODE=cloudflare`, an exact HTTPS `ADMIN_ACCESS_ISSUER` under `cloudflareaccess.com`, and a nonempty JSON `ADMIN_ACCESS_AUDIENCES` list. Put the production application audience and each protected-preview application audience in that explicit list. The backend derives the issuer's `/cdn-cgi/access/certs` endpoint; an arbitrary JWKS URL cannot be configured.

The backend validates the `Cf-Access-Jwt-Assertion` header with RS256, the JWT type, signing-key ID, issuer, audience, expiration, not-before and issued-at timestamps, application-token type, and a nonempty human subject. It never falls back to the `CF_Authorization` cookie. Cloudflare publishes the current and previous signing keys at the team JWKS endpoint; see Cloudflare's [JWT validation guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Signing keys are cached for ten minutes. An unknown key can trigger at most one refresh per five-second cooldown, and a JWKS request times out after five seconds. Known keys work only while that cache is fresh. A refresh failure after the ten-minute freshness window fails closed; there is no unbounded stale-key fallback. Missing, malformed, expired, future, wrong-issuer, wrong-audience, unknown-key, invalid-signature, and JWKS failures all return the same typed `FORBIDDEN` response. Only a finite aggregate denial category is recorded.

Both the assertion and local substitute headers are captured and deleted before request logging or error reporting. Never log, attach to Sentry, echo, or persist an assertion, its claims, or the local substitute. Do not add either proof header to browser CORS allow-headers: Cloudflare supplies the assertion after the browser request reaches the edge.

## Edge and origin requirements

JWT validation proves possession of a signed bearer assertion; application code cannot prove that a request physically traversed the expected edge. `Cf-Ray`, forwarded IP headers, `Host`, and similar client-controlled values are not edge authentication.

Production and protected previews must therefore make the origin unreachable except through the validating edge. Prefer an outbound-only Cloudflare Tunnel whose administrator path requires Access. If a public origin connection is retained, enforce Authenticated Origin Pulls at the actual TLS ingress and restrict inbound traffic to Cloudflare at the firewall. The edge or ingress must replace any inbound assertion header rather than forwarding a client-supplied copy. This deployment control is completed and smoke-tested with the administrator deployment work; an application integration test cannot prove direct-IP blocking.

Configure Access to answer CORS preflight at the edge when possible. The origin also permits `OPTIONS` to reach the exact-origin CORS handler because browser preflight carries neither a DXRating session nor a usable application assertion. A successful preflight performs no read or mutation and does not weaken the dual gate on the actual request.

## Local and test mode

`ADMIN_ACCESS_MODE=test_bypass` is accepted only when `NODE_ENV` is not `production`, every configured backend and browser origin is loopback, and `ADMIN_ACCESS_TEST_BYPASS_SECRET` is set. Even with the exact secret, the boundary rejects the substitute unless the request URL itself has a loopback hostname. Production and protected-preview configuration therefore fail at startup, and a request addressed to a preview host fails at the boundary.

The secret is a server-side local-development value. A local reverse proxy or test caller injects `X-DXRating-Admin-Access-Test` after the browser boundary. Never expose it through a `VITE_` variable, frontend bundle, local storage, issue, log, or telemetry. The substitute cannot be combined with a Cloudflare assertion and is not accepted by a production or protected-preview process.
