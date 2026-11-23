/**
 * Chrome origin trials the site takes part in, as `<meta http-equiv="origin-trial">` tags in every page's head.
 *
 * Email Verification (gekichumai/meta#80): Chrome's Email Verification Protocol, which LoginForm's sign-up uses, runs
 * as an origin trial (Chrome 150–160 on desktop, 154–160 on Android). Register dxrating.net at
 * https://developer.chrome.com/origintrials#/view_trial/10696049115004929 and renew it at
 * https://developer.chrome.com/origintrials#/trials/my when Chrome says it expires (tokens from before the trial's
 * extension stopped working on 2026-11-17). The token goes in the `EMAIL_VERIFICATION_ORIGIN_TRIAL_TOKEN` repository
 * variable, which release.yml passes to the build as `VITE_EMAIL_VERIFICATION_ORIGIN_TRIAL_TOKEN`. Unset, no tag is
 * emitted and Chrome leaves the sign-up form's token field alone. A token is bound to its origin, so on other origins
 * (previews, localhost) Chrome ignores it.
 *
 * The tag is the same for every request, so cached HTML (html-cache.ts) and hydration are unaffected, and it needs no
 * CSP change: the browser fetches nothing because of it, and the backend makes the calls to the mail provider.
 */
export const originTrialMeta = (
  tokens: readonly (string | undefined)[] = [import.meta.env.VITE_EMAIL_VERIFICATION_ORIGIN_TRIAL_TOKEN],
) =>
  tokens
    .map((token) => token?.trim())
    .filter((token): token is string => !!token)
    .map((content) => ({ httpEquiv: 'origin-trial', content }))