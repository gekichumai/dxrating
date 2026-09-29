const optionalString = (value: unknown) => (typeof value === 'string' ? value : undefined)

export const BUNDLE = {
  gitCommit: optionalString(import.meta.env.VITE_GIT_COMMIT),
  version: optionalString(import.meta.env.VITE_VERSION),
  buildNumber: optionalString(import.meta.env.VITE_BUILD_NUMBER),
  buildTime: optionalString(import.meta.env.VITE_BUILD_TIME),
}