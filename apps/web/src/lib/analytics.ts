import posthog, { type BeforeSendFn, type Properties } from 'posthog-js'
import type { DXVersion, Region } from '@/models/context/AppContext'

export type RatingImportSource = 'maimai_net' | 'diving_fish' | 'lxns' | 'json' | 'aqua_dx' | 'mu_net' | 'aqua_sqlite'

export type SheetViewSource =
  | 'search_results'
  | 'rating_calculator'
  | 'trending'
  | 'plate'
  | 'completion_table'
  | 'level_progress'
  | 'toplist'
  | 'recommend'
  | 'random'
  | 'home'
  | 'song_hub'
  | 'unknown'

/** Where a share image was exported to */
export type ShareImageOutcome = 'viewed' | 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed'
export type ToplistKind = 'ap' | 'app' | 'fc' | 'fcp' | 'fdx' | 'fdxp' | 'highest' | 'dx_score'
export type RatingToolKind = 'rating_for_achievement' | 'achievement_for_rating' | 'rating_table'
export type RatingImportMode = 'merge' | 'replace'
export type RatingImportTrigger = 'automatic' | 'manual'

/**
 * Game region as selected in the app (`region` super property) or, on import
 * events, the region the records came from. North American cabinets share
 * maimai NET with the international build (maimaidx-eng.com), so they report
 * `intl`; the catalog's `usa` region only describes chart availability and is
 * never used as an analytics value.
 */
export type AnalyticsRegion = Region

/** Runtime shell. Lets insights segment app traffic without relying on `$host`. */
export type AnalyticsPlatform = 'web' | 'ios'
/** Which deployment sent the event; use instead of `$host` for test-traffic filters. */
export type AnalyticsDeployment = 'production' | 'preview' | 'development'

type SheetProperties = {
  song_id: string
  sheet_type: string
  sheet_difficulty: string
}

/** How the first sign-in migration went (§10): a new save, merged into one, the cloud save only, or replaced it */
export type CloudSaveMigrationMode = 'fresh' | 'merge' | 'cloud_only' | 'replace'

/**
 * Cloud save events (design §12.3), counted by `$device_id`. Their properties are kinds and counts only: never an
 * account, save, job or chart ID, a name or a value.
 */
type CloudSaveEventProperties = {
  /** This device turned cloud save on: the beta opt-in, or a first save activated by the migration */
  cloudsave_enabled: { via: 'opt_in' | 'migration' }
  cloudsave_migration_started: { mode: CloudSaveMigrationMode; record_count: number }
  cloudsave_migration_succeeded: { mode: CloudSaveMigrationMode; record_count: number; duration_ms: number }
  cloudsave_migration_failed: { mode: CloudSaveMigrationMode; error_code: string; duration_ms: number }
  /** An import job of a cloud save finished; `source` is the job's source (`maimai-net-jp`, `dxrating-json`…) */
  import_job_succeeded: { source: string; fetched_by: 'server' | 'client' }
  import_job_failed: { source: string; fetched_by: 'server' | 'client' }
  /** A sync issue (a change the server did not take) was shown for the first time on this page */
  sync_conflict_shown: { kind: 'superseded' | 'rejected' }
}

type AnalyticsEventProperties = CloudSaveEventProperties & {
  about_dialog_opened: Record<string, never>
  add_sheet_alt_name_button_clicked: SheetProperties
  locale_selector_item_clicked: {
    locale: string
    previous_locale: string
  }
  theme_selector_item_clicked: {
    mode: string
    previous_mode: string
  }
  oneshot_render_button_clicked: {
    entry_count: number
    b15_count: number
    b35_count: number
  }
  oneshot_render_failed: {
    duration_ms: number
    entry_count: number
    error_code: string
  }
  oneshot_rendered: {
    duration_ms: number
    duration_seconds: number
    entry_count: number
    response_size_bytes: number
  }
  rating_calculator_cleared: {
    entry_count: number
  }
  rating_calculator_entry_saved: SheetProperties & {
    action: 'added' | 'updated'
    achievement_rate_band: string
    entry_count: number
  }
  rating_calculator_remove_entry_button_clicked: {
    entry_count_before: number
    sheet_id: string
  }
  rating_onboarding_action_clicked: {
    action: 'maimai_net' | 'manual'
  }
  rating_calculator_view_changed: {
    setting: 'show_only_b50' | 'ap50'
    enabled: boolean
  }
  rating_exported: {
    format: 'json'
    scope: 'all' | 'best_50'
    entry_count: number
  }
  rating_import_failed: {
    source: RatingImportSource
    duration_ms: number
    error_code: string
    mode: 'merge' | 'replace'
    trigger: 'automatic' | 'manual'
  }
  rating_import_started: {
    source: RatingImportSource
    mode: 'merge' | 'replace'
    trigger: 'automatic' | 'manual'
  }
  rating_import_succeeded: {
    source: RatingImportSource
    duration_ms: number
    entry_count: number
    warning_count: number
    mode: 'merge' | 'replace'
    trigger: 'automatic' | 'manual'
    region?: AnalyticsRegion
  }
  sheet_content_viewed: SheetProperties & {
    source: SheetViewSource
    position?: number
    query_present?: boolean
    result_count?: number
    sheet_version: string
    internal_level: number
    is_rating_eligible: boolean
  }
  sheet_favorite_button_clicked: SheetProperties & {
    favored: boolean
  }
  sheet_link_copied: SheetProperties
  sheet_alias_created: SheetProperties
  sheet_alias_failed: SheetProperties & {
    error_code: 'request_failed'
  }
  sheet_search_clear_button_clicked: {
    previous_query_length: number
    result_count: number
  }
  sheet_list_layout_changed: {
    layout: 'list' | 'grid'
    previous_layout: 'list' | 'grid'
  }
  sheet_search_performed: {
    query_length: number
    result_count: number
    zero_results: boolean
    duration_ms: number
    active_filter_count: number
    selected_version_count: number
    selected_difficulty_count: number
    selected_category_count: number
    selected_tag_count: number
    favorites_only: boolean
    sort: string
  }
  tab_switched: {
    tab: string
    source: 'top_navigation'
  }
  plate_viewed: {
    plate_id: string
    region: AnalyticsRegion
    completed_charts: number
    total_charts: number
  }
  plate_share_exported: {
    plate_id: string
    outcome: ShareImageOutcome
  }
  completion_overlay_target_changed: {
    level: string
    target: string
  }
  level_progress_viewed: {
    level: string
    target: string
    completed: number
    total: number
  }
  toplist_viewed: {
    kind: ToplistKind
    count: number
  }
  toplist_share_exported: {
    kind: ToplistKind
    outcome: ShareImageOutcome
  }
  tolerance_calculated: SheetProperties & {
    target_achievement: number
    source: 'chart_page' | 'tool_page'
  }
  rating_tool_used: {
    tool: RatingToolKind
    internal_level: number
  }
  recommend_viewed: {
    suggestion_count: number
    b50_floor: number
  }
  random_chart_rolled: {
    filter_count: number
    result_found: boolean
  }
  home_module_clicked: {
    module: string
    target?: string
  }
  song_hub_viewed: {
    song_id: string
    has_records: boolean
  }
}

export type AnalyticsEventName = keyof AnalyticsEventProperties

export const captureAnalyticsEvent = <Event extends AnalyticsEventName>(
  event: Event,
  properties: AnalyticsEventProperties[Event],
) => {
  posthog.capture(event, properties as Properties)
}

export const createRatingImportTracker = (
  source: RatingImportSource,
  mode: RatingImportMode = 'replace',
  trigger: RatingImportTrigger = 'manual',
) => {
  const startedAt = performance.now()
  let finished = false
  captureAnalyticsEvent('rating_import_started', { source, mode, trigger })

  return {
    succeeded: (entryCount: number, warningCount = 0, region?: AnalyticsRegion) => {
      if (finished) return
      finished = true
      captureAnalyticsEvent('rating_import_succeeded', {
        source,
        duration_ms: performance.now() - startedAt,
        entry_count: entryCount,
        warning_count: warningCount,
        mode,
        trigger,
        region,
      })
    },
    failed: (errorCode: string) => {
      if (finished) return
      finished = true
      captureAnalyticsEvent('rating_import_failed', {
        source,
        duration_ms: performance.now() - startedAt,
        error_code: errorCode,
        mode,
        trigger,
      })
    },
  }
}

const NATIVE_SHELL_PROTOCOLS = new Set(['capacitor:', 'ionic:'])

export const detectAnalyticsPlatform = (url: string, nativePlatform?: string): AnalyticsPlatform => {
  if (nativePlatform === 'ios') return 'ios'
  try {
    return NATIVE_SHELL_PROTOCOLS.has(new URL(url).protocol) ? 'ios' : 'web'
  } catch {
    return 'web'
  }
}

export const detectAnalyticsDeployment = (url: string, platform: AnalyticsPlatform): AnalyticsDeployment => {
  // A native shell serves the bundled app from `capacitor://localhost`; that is production traffic.
  if (platform !== 'web') return 'production'
  try {
    const { hostname } = new URL(url)
    if (hostname === 'dxrating.net' || hostname === 'www.dxrating.net') return 'production'
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return 'development'
    return 'preview'
  } catch {
    return 'preview'
  }
}

type BaseAnalyticsContext = {
  platform: AnalyticsPlatform
  deployment: AnalyticsDeployment
  game_version: DXVersion
  region: AnalyticsRegion
}

/**
 * Registered from `posthog.init`'s `loaded` callback, before the initial
 * `$pageview`, so every event carries platform, region and version.
 */
export const registerBaseAnalyticsContext = (properties: BaseAnalyticsContext) => {
  deviceContext = { platform: properties.platform, deployment: properties.deployment }
  posthog.register(properties)
}

// `posthog.reset()` clears every super property. Platform and deployment
// describe the page load rather than the user, so they are restored after an
// identity reset; region/version are re-registered by `SideEffector`.
let deviceContext: Pick<BaseAnalyticsContext, 'platform' | 'deployment'> | undefined

const resetAnalyticsIdentity = () => {
  posthog.reset()
  if (deviceContext) posthog.register(deviceContext)
}

export const registerAnalyticsContext = (properties: {
  app_surface: 'web'
  game_version: DXVersion
  region: AnalyticsRegion
  language: string
  calculated_rating: number
  rating_entry_count: number
}) => {
  posthog.register(properties)
}

export const identifyAnalyticsUser = (userId: string) => {
  const currentUserId = posthog.get_property('$user_id')
  if (currentUserId === userId) return

  if (currentUserId) resetAnalyticsIdentity()
  posthog.identify(userId)
}

export const resetAnalyticsUser = () => {
  if (posthog.get_property('$user_id')) {
    resetAnalyticsIdentity()
  }
}

export const achievementRateBand = (achievementRate: number): string => {
  if (achievementRate >= 100.5) return '100.5-101'
  if (achievementRate >= 100) return '100-100.4999'
  if (achievementRate >= 99) return '99-99.9999'
  if (achievementRate >= 97) return '97-98.9999'
  if (achievementRate >= 94) return '94-96.9999'
  if (achievementRate >= 90) return '90-93.9999'
  if (achievementRate >= 80) return '80-89.9999'
  return 'below-80'
}

const URL_PROPERTY_NAMES = [
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$session_entry_url',
] as const

export const sanitizeAnalyticsUrl = (value: string): string => {
  try {
    const isAbsolute = /^https?:\/\//i.test(value)
    const parsed = new URL(value, 'https://dxrating.net')
    parsed.search = ''
    parsed.hash = ''
    return isAbsolute ? parsed.toString() : parsed.pathname
  } catch {
    return value
  }
}

const sanitizeProperties = (properties: Properties | undefined): Properties | undefined => {
  if (!properties) return properties

  const sanitized = { ...properties }
  for (const property of URL_PROPERTY_NAMES) {
    const value = sanitized[property]
    if (typeof value === 'string') {
      sanitized[property] = sanitizeAnalyticsUrl(value)
    }
  }
  return sanitized
}

export const sanitizeAnalyticsEvent: BeforeSendFn = (event) => {
  if (!event) return null

  return {
    ...event,
    properties: sanitizeProperties(event.properties) ?? {},
    $set: sanitizeProperties(event.$set),
    $set_once: sanitizeProperties(event.$set_once),
  }
}