export const BUNDLE = {
  gitCommit: import.meta.env.VITE_GIT_COMMIT as string | undefined,
  buildNumber: import.meta.env.VITE_BUILD_NUMBER as string | undefined,
  buildTime: import.meta.env.VITE_BUILD_TIME as string | undefined,
};
