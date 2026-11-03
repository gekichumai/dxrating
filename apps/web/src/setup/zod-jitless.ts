// Zod compiles object parsers with `new Function` unless it runs jitless. It decides when a schema is created, after
// probing for eval support, and schemas are created as the modules of the client bundle evaluate. The
// Content-Security-Policy forbids eval (security-headers.ts), so the probe would only be blocked and reported as a
// violation on every page load.
//
// Zod shares its global config through `globalThis.__zod_globalConfig`. The root route renders this script in the
// <head>, where it runs before the module scripts of the bundle; like every inline script of the page, it carries
// the nonce of the response.
export const ZOD_JITLESS_INLINE_SCRIPT = '(globalThis.__zod_globalConfig??={}).jitless=true'