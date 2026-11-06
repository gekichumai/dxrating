import { MenuItem, TextField } from '@mui/material'
import { type FC, useMemo } from 'react'
import { useSongCatalog } from '@/catalog/CatalogContext'
import type { ConstantTable } from '@/components/chartDiscovery/constantTables'
import { FilterChip } from '@/components/completion/TableChrome'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { ShareImageButton } from '@/components/global/ShareImageButton'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import {
  COMPLETION_TARGET_LABELS,
  COMPLETION_TARGETS,
  type CompletionStatus,
  parseCompletionTarget,
} from './completion'
import { buildCompletionShareImage } from './completionShareImage'
import type { CompletionFilter, CompletionOverlayState } from './useCompletionOverlay'

const FILTERS: CompletionFilter[] = ['all', 'pending', 'unplayed', 'done']

const STATUS_LABELS = {
  done: m.completion_status_done,
  pending: m.completion_status_pending,
  unplayed: m.completion_status_unplayed,
} satisfies Record<CompletionStatus, typeof m.completion_status_done>

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
  const catalog = useSongCatalog()
  const locale = useLocale()
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
        <span>{m.completion_empty({}, { locale })}</span>
        <a href="/rating" className="link">
          {m.completion_emptyLink({}, { locale })}
        </a>
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
    <MaterialSurface
      as="section"
      className="w-full p-4 flex flex-col gap-3"
      aria-label={m.completion_title({}, { locale })}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="section-title m-0">{m.completion_title({}, { locale })}</h2>
          <span className="text-sm text-fg-2 num">
            {m.completion_rate({ level: table.level, target: targetLabel, percent }, { locale })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TextField
            select
            size="small"
            label={m.completion_target({}, { locale })}
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
            shareTitle={m.completion_shareTitle({ level: table.level, target: targetLabel }, { locale })}
            getImage={() =>
              buildCompletionShareImage({
                table,
                target,
                summary,
                title: m.completion_shareTitle({ level: table.level, target: targetLabel }, { locale }),
                summaryLine: m.completion_summaryLine({ ...summary, percent }, { locale }),
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

      <span className="sr-only">{m.completion_summaryLine({ ...summary, percent }, { locale })}</span>
      <fieldset className="m-0 p-0 border-0 min-w-0 flex flex-wrap items-center gap-2">
        <legend className="sr-only">{m.completion_filter({}, { locale })}</legend>
        {FILTERS.map((filter) => (
          <FilterChip key={filter} active={overlay.filter === filter} onClick={() => overlay.setFilter(filter)}>
            <span className="num">
              {filter === 'all'
                ? m.completion_filterAll({ count: summary.total }, { locale })
                : STATUS_LABELS[filter]({ count: summary[filter] }, { locale })}
            </span>
          </FilterChip>
        ))}
        <a href="/me/progress" className="link ms-auto text-sm">
          {m.completion_progressLink({}, { locale })}
        </a>
      </fieldset>
    </MaterialSurface>
  )
}