# App Review: comment reporting and author blocking

Implementation is local and unshipped. Do not represent these changes as part of build 2026090101. The selected submission remains rejected under 1.2 and 2.1(a).

## Behavior

Each comment from another user has a menu with **Report comment** and **Block author**. Signed-out users are directed to sign in. Both actions require confirmation and immediately hide content locally; a failed save restores visibility and displays an error.

- Reporting hides only the selected comment for the reporting account.
- Blocking hides all comments by the author for the blocking account, including other cached charts and future comments. The backend derives the author from the selected comment, never from client-supplied identity.
- Both actions persist a moderation report. Repeated requests are idempotent. A new session or another device gets the same server-filtered list. Other viewers are unaffected until a moderator removes a comment globally.
- Comment responses include a stable `author_id`. The native client sends its session cookie for reads and bypasses public/disk caches. Web cache keys include the viewer; local filters also protect against stale/in-flight responses. Native account switches discard previous-viewer state.

## Deployment prerequisites (not performed)

1. Apply generated migration `0012_comment_safety.sql` through the normal migration runner. Deploy backend before updated clients.
2. Reports are stored directly in `comment_reports` as the developer moderation inbox. No webhook, retry worker, or third-party service is required. An operator must review this inbox regularly; storing a report does not send a separate push/email notification.
3. Release the native and web clients after validation. No build upload, deployment, or resubmission was authorized in this implementation task.

## Moderator workflow

Use the backend's normal trusted database environment; these commands are for an authorized operator, not a public API. From `apps/backend`:

```sh
pnpm exec tsx src/moderate-comments.ts list
pnpm exec tsx src/moderate-comments.ts remove <report-id>
pnpm exec tsx src/moderate-comments.ts dismiss <report-id>
```

`remove` soft-removes the comment globally and resolves all reports for it. `dismiss` resolves only the chosen report. Neither restores a reporter's hidden comment or changes their block preference. Queue records follow account/comment deletion through database foreign keys.

## Reviewer instructions after release

1. Sign into the dedicated populated demo account using App Review Information credentials.
2. Open a specified seeded chart's Comments section. Inverted World / DX MASTER has a persisted sample comment by App Review Demo. To demonstrate report/block, use a separate author’s comment; a reviewer cannot report their own sample.
3. Open the ellipsis on another author's comment, choose Report comment, confirm, and observe only that comment disappear.
4. Open another comment from that author, choose Block author, confirm, and observe that author's other comments disappear. A second author's comments remain visible.
5. Reopen the chart and relaunch/sign in again to show the saved preference. An operator separately verifies the saved entry in the moderation inbox.
6. The user will record the complete workflow on a physical device, including terms before registration/login. Simulator unit tests and the existing simulator video do not replace that evidence.

## Reviewer account and terms

- Created `asreview39@dxrating.net` with a cryptographically random 16-character password. Saved in macOS Keychain under service `DXRating App Review 2026-09` and in App Store Connect Sign-In Information. Password is intentionally absent from this repository.
- Display name: App Review Demo. Verified sign-out and fresh password sign-in on production. A benign sample comment on Inverted World / DX MASTER survives reload. Device-local scores/play history are not synced by signing in.
- App Store Connect Sign-in required, credentials, and updated notes were saved and visually verified after reload. Existing contact details were preserved. No resubmission occurred.
- Terms are drafted in `docs/app-review/terms-of-service.md`, rendered at `/terms-of-service`, and bundled in the native app. Both apps require explicit agreement before authentication, including OAuth and passkeys. Conditional passkey autofill starts only after agreement. All supported locales are included. No separate legal-consent database is introduced.
- Simple schema: `comment_reports` has id, reporter_id, comment_id, action, created_at, resolved_at; a unique reporter/comment/action constraint prevents duplicates. `user_blocks` stores blocker_id, blocked_id, created_at. Comments gain removed_at for moderation.
- Physical-device recording remains for the user. Implementation and migration are local and unshipped.

Current App Store Connect: https://appstoreconnect.apple.com/apps/6797069834/distribution/ios/version/inflight
Latest rejection: https://appstoreconnect.apple.com/apps/6797069834/distribution/reviewsubmissions/details/17c4f03a-5f50-4ea0-a8b2-e28e3cc8a214

App Review 1.2 also requires content filtering and timely moderation. This task implements the expressly requested comment actions and moderation handling; it does not claim a complete legal/compliance audit of every user-generated surface.

## Validation performed

- Monorepo production build succeeds; lint has zero errors (24 existing warnings); formatting and diff whitespace checks pass.
- Backend comment integration suite: 8 passing tests against a separate local PostgreSQL test database, covering authentication, idempotency, durable viewer filtering, cross-chart blocking, moderation inbox persistence, and moderation removal.
- Full web suite: 174 passing tests across 60 files.
- Native simulator UI verified: terms link opens bundled readable content; Apple, Google, GitHub, and passkey controls are disabled before agreement.
- Full native unit suite: 182 passing tests on iPhone 17 Pro / iOS 26.5, including three new comment-safety tests and the complete supported-locale translation contract.
- Terms production preview in zh-Hans: localized terms render, providers remain disabled before agreement and enable afterward, with no hydration errors.
- Production-preview browser in zh-Hans: report comment A, confirm only A disappears; block that author via comment B, confirm B disappears and unrelated C remains; full reload preserves the filtering. No React hydration errors observed (Turnstile emitted its own console messages).
- App Store Connect Notes updated and verified after reload, explicitly stating changes are unshipped and the existing video is simulator footage. The verified reviewer credentials were subsequently saved; no resubmission occurred.

Isolated implementation checkouts: `/private/tmp/dxrating-app-review-20260919` (base `9e3dd73`) and `/private/tmp/dxrating-ios-app-review-20260919` (base `2e29d4e`), both on `codex/app-review-comment-safety`. Original checkouts and their unrelated pending changes are preserved. Changes are staged but uncommitted; patch artifacts are `/private/tmp/dxrating-app-review-backend-web.patch` and `/private/tmp/dxrating-app-review-ios.patch`.
