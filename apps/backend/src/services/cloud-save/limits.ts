/** Request body limits of the cloud save routes (design §11.4) */
export const CLOUD_SAVE_BODY_LIMIT_BYTES = 1024 * 1024
/** `replace` and `client-imports` carry a whole save */
export const CLOUD_SAVE_LARGE_BODY_LIMIT_BYTES = 2 * 1024 * 1024
/**
 * Stored records (live and tombstones) per save. The design sets no bound; this one keeps a save to a few times the
 * catalog (~7.4k charts in 2026), which a real player cannot reach, so the paths that read a whole save (replace,
 * export) stay bounded. A write that would store more is refused: a mutation `rejected` (`record-limit`), an import
 * record counted `rejected`, a replace 400.
 */
export const CLOUD_SAVE_MAX_RECORDS_PER_SAVE = 20_000