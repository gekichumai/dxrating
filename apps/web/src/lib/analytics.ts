import posthog, { type BeforeSendFn, type Properties } from 'posthog-js'

export type RatingImportSource = 'maimai_net' | 'diving_fish' | 'lxns' | 'json' | 'aqua_dx' | 'mu_net' | 'aqua_sqlite'

export type SheetViewSource = 'search_results' | 'rating_calculator' | 'trending' | 'unknown'
export type RatingImportMode = 'merge' | 'replace'
export type RatingImportTrigger = 'automatic' | 'manual'

type SheetProperties = {
  song_id: string
  sheet_type: string
  sheet_difficulty: string
}

type AnalyticsEventProperties = {
  about_dialog_opened: Record<string, never>
  add_sheet_alt_name_button_clicked: SheetProperties
  locale_selector_item_clicked: {
    locale: string
    previous_locale: string
  }
  netimport_started: {
    mode: 'merge' | 'replace'
    trigger: 'automatic' | 'manual'
  }
  netimport_succeeded: {
    region: 'jp' | 'intl'
    count: number
    mode: 'merge' | 'replace'
    duration_ms: number
    warning_count: number
    trigger: 'automatic' | 'manual'
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
  rating_calculator_view_changed: {
    setting: 'compact_mode' | 'show_only_b50'
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
    region?: string
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
    succeeded: (entryCount: number, warningCount = 0, region?: string) => {
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

export const registerAnalyticsContext = (properties: {
  app_surface: 'web'
  game_version: string
  region: string
  language: string
  calculated_rating: number
  rating_entry_count: number
}) => {
  posthog.register(properties)
}

export const identifyAnalyticsUser = (userId: string) => {
  const currentUserId = posthog.get_property('$user_id')
  if (currentUserId === userId) return

  if (currentUserId) posthog.reset()
  posthog.identify(userId)
}

export const resetAnalyticsUser = () => {
  if (posthog.get_property('$user_id')) {
    posthog.reset()
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