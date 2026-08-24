import {
  ADMIN_CHART_REPORT_CATEGORY_KEYS,
  ADMIN_CHART_REPORT_FIELD_KEYS,
  type AdminChartReportCategoryKey,
  type AdminChartReportFieldKey,
} from '@gekichumai/admin-contract'
import type { MessageKey, TranslationValues } from '../i18n'

type TranslateChartReportLabel = (key: MessageKey, values?: TranslationValues) => string

export const chartReportFieldLabels = (
  translate: TranslateChartReportLabel,
): Readonly<Record<AdminChartReportFieldKey, string>> =>
  Object.fromEntries(
    ADMIN_CHART_REPORT_FIELD_KEYS.map((field) => [field, translate(`chartReports.fields.${field}` as MessageKey)]),
  ) as Record<AdminChartReportFieldKey, string>

export const chartReportCategoryLabels = (
  translate: TranslateChartReportLabel,
): Readonly<Record<AdminChartReportCategoryKey, string>> =>
  Object.fromEntries(
    ADMIN_CHART_REPORT_CATEGORY_KEYS.map((category) => [
      category,
      translate(`chartReports.categories.${category}` as MessageKey),
    ]),
  ) as Record<AdminChartReportCategoryKey, string>