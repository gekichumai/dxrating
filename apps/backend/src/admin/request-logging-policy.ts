/**
 * Administrator paths can contain user identifiers, while request failures
 * can contain private moderation reasons. Keep the whole namespace out of the
 * generic structured request logger; administrator authorization telemetry is
 * emitted separately with finite, sanitized labels.
 */
export const ADMIN_GENERIC_REQUEST_LOG_EXCLUSIONS = ['/api/admin', '/api/admin/**'] as const