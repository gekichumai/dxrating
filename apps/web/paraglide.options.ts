import type { CompilerOptions } from '@inlang/paraglide-js'

/**
 * Paraglide compiler options, shared by vite.config.ts and vitest.config.ts. Messages live in messages/<locale>.json
 * and compile to src/paraglide (generated, not committed).
 *
 * The locale is resolved by the app, not by Paraglide strategies: setup/locale.ts reads `?locale=`, the cookie and
 * Accept-Language on the server, components pass `{ locale }` from useLocale(), and src/i18n/runtime.ts overrides
 * getLocale() for the remaining browser-only calls. So no AsyncLocalStorage and no URL strategy.
 */
export const PARAGLIDE_OPTIONS = {
  project: './project.inlang',
  outdir: './src/paraglide',
  emitTsDeclarations: true,
  outputStructure: 'message-modules',
  strategy: ['baseLocale'],
  disableAsyncLocalStorage: true,
} satisfies CompilerOptions