/**
 * Flags stored in `feature_flag_overrides.flag`. Kept free of imports so the
 * `flag:set` operator script can share it without loading the app config.
 */
export const FEATURE_FLAGS = ['cloud_save', 'server_imports'] as const
export type FeatureFlag = (typeof FEATURE_FLAGS)[number]

export const isFeatureFlag = (value: string): value is FeatureFlag =>
  (FEATURE_FLAGS as readonly string[]).includes(value)