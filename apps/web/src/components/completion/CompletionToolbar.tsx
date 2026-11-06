import { MenuItem, TextField } from '@mui/material'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSongCatalog } from '@/catalog/CatalogContext'
import type { ConstantTable } from '@/components/chartDiscovery/constantTables'
import { FilterChip } from '@/components/completion/TableChrome'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { ShareImageButton } from '@/components/global/ShareImageButton'
import { COMPLETION_TARGET_LABELS, COMPLETION_TARGETS, parseCompletionTarget } from './completion'
import { buildCompletionShareImage } from './completionShareImage'
import type { CompletionFilter, CompletionOverlayState } from './useCompletionOverlay'
import { InternalLink } from '@/components/global/InternalLink'

const FILTERS: CompletionFilter[] = ['all', 'pending', 'unplayed', 'done']

export const completionPercent = (done: number, total: number) =>
  total > 0 ? Math.floor((done / total) * 1000) / 10 : 0

/**
 * The overlay controls and level progress of a constant table. Until mounted it renders an empty placeholder the
 * size of the empty state, so the table below doesn't jump once the records are known.
 */
export const CompletionToolbar: FC<{ table: ConstantTable; overlay: CompletionOverlayState }> = ({
  table,
  overlay,
}) => {
  const { i18n, t } = useTranslation(['completion'])
  const catalog = useSongCatalog()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const number = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  )
  if (!overlay.mounted) return <MaterialSurface variant="thin" className="w-full min-h-[46px]" aria-hidden />

  if (!overlay.active) {
    return (
      <MaterialSurface
        variant="thin"
        className="w-full min-h-[46px] px-4 py-3 text-sm text-fg-1 flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        <span>{t('completion:empty')}</span>
        <InternalLink href="/rating" className="link">
          {t('completion:empty-link')}
        </InternalLink>
      </MaterialSurface>
    )
  }

  const { summary, target } = overlay
  const targetLabel = COMPLETION_TARGET_LABELS[target]
  const percent = number.format(completionPercent(summary.done, summary.total))
  const segments = [
    { key: 'done', value: summary.done, className: 'bg-accent' },
    { key: 'pending', value: summary.pending, className: 'bg-[color-mix(in_oklab,var(--accent)_35%,transparent)]' },
  ]

  return (
    <MaterialSurface as="section" className="w-full p-4 flex flex-col gap-3" aria-label={t('completion:title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="section-title m-0">{t('completion:title')}</h2>
          <span className="text-sm text-fg-2 num">
            {t('completion:rate', { level: table.level, target: targetLabel, percent })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TextField
            select
            size="small"
            label={t('completion:target')}
            value={target}
            onChange={(event) => {
              const next = parseCompletionTarget(event.target.value)
              if (next) overlay.setTarget(next)
            }}
            sx={{ minWidth: 104 }}
          >
            {COMPLETION_TARGETS.map((option) => (
              <MenuItem key={option} value={option}>
                {COMPLETION_TARGET_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>
          <ShareImageButton
            size="small"
            // Same 40px height as the small target select beside it
            sx={{ minHeight: 40 }}
            filename={`dxrating-lv${table.level.replace('+', 'p')}-${target}.png`}
            shareTitle={t('completion:share-title', { level: table.level, target: targetLabel })}
            getImage={() =>
              buildCompletionShareImage({
                table,
                target,
                summary,
                title: t('completion:share-title', { level: table.level, target: targetLabel }),
                summaryLine: t('completion:summary-line', { ...summary, percent }),
                recordOf: (sheetId) => overlay.records.get(sheetId)?.best,
                imageNameOf: (sheetId) => catalog.getById(sheetId)?.imageName,
              })
            }
          />
        </div>
      </div>

      <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/8" aria-hidden="true">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={segment.className}
            style={{ width: `${summary.total ? (segment.value / summary.total) * 100 : 0}%` }}
          />
        ))}
      </div>

      <span className="sr-only">{t('completion:summary-line', { ...summary, percent })}</span>
      <fieldset className="m-0 p-0 border-0 min-w-0 flex flex-wrap items-center gap-2">
        <legend className="sr-only">{t('completion:filter')}</legend>
        {FILTERS.map((filter) => (
          <FilterChip key={filter} active={overlay.filter === filter} onClick={() => overlay.setFilter(filter)}>
            <span className="num">
              {filter === 'all'
                ? t('completion:filter-all', { count: summary.total })
                : t(`completion:status.${filter}`, { count: summary[filter] })}
            </span>
          </FilterChip>
        ))}
        <InternalLink href="/me/progress" className="link ms-auto text-sm">
          {t('completion:progress-link')}
        </InternalLink>
      </fieldset>
    </MaterialSurface>
  )
}