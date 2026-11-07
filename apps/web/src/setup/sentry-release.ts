/**
 * The Sentry release for this build, or '' when Sentry must stay off. Only CI builds report: a production release
 * (`dxrating@v1.7.20`) or a PR preview (`dxrating@pr-505+<sha>`). Local `vite build` / `vite preview` runs on dev
 * machines and agent worktrees get '' and never initialise Sentry, so they can't pollute the production project.
 */
const RELEASE_PATTERN = /^dxrating@(v\d+\.\d+\.\d+|pr-\d+\+[0-9a-f]{7,40})$/

export function resolveSentryRelease(env: { CI?: string; SENTRY_RELEASE?: string }): string {
  const release = env.SENTRY_RELEASE?.trim() ?? ''
  return env.CI === 'true' && RELEASE_PATTERN.test(release) ? release : ''
}