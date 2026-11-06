import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import clsx from 'clsx'
import { type FC, useId, useSyncExternalStore } from 'react'
import { DIFFICULTIES } from '@/models/difficulties'
import type { ChartScore, ImportChange, ImportChangeKind, ImportPlan } from '@/models/scores/importPlan'
import { planChangesSave } from '@/models/scores/importPlan'
import { importReviewController, type ImportReviewController, type ImportTrigger } from '@/models/scores/importReview'
import { IMPORT_UNDO_WINDOW_MS } from '@/models/scores/importUndo'
import type { DifficultyEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { importSourceLabel } from './importSourceLabel'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

/** At most this many risky charts are listed; the rest are counted */
const RISKY_LIST_LIMIT = 50

const COUNT_KINDS: readonly ImportChangeKind[] = ['added', 'improved', 'unchanged', 'lowered', 'removed']

const COUNT_LABELS = {
  added: m.ratingCalculator_io_import_review_count_added,
  improved: m.ratingCalculator_io_import_review_count_improved,
  unchanged: m.ratingCalculator_io_import_review_count_unchanged,
  lowered: m.ratingCalculator_io_import_review_count_lowered,
  removed: m.ratingCalculator_io_import_review_count_removed,
} satisfies Record<ImportChangeKind, PlainMessage>

const formatAchievement = (score: ChartScore) => `${score.achievementRate.toFixed(4)}%`

const flagsOf = (score: ChartScore) =>
  [score.comboFlag?.toUpperCase(), score.syncFlag?.toUpperCase()].filter(Boolean).join(' ')

const ScoreSummary: FC<{ score: ChartScore }> = ({ score }) => {
  const flags = flagsOf(score)
  return (
    <span className="num">
      {formatAchievement(score)}
      {flags && <span className="text-secondary"> {flags}</span>}
    </span>
  )
}

const RiskyChangeRow: FC<{ change: ImportChange; sheet: VersionedSheet | null | undefined }> = ({ change, sheet }) => {
  const locale = useLocale()
  const difficulty = sheet ? DIFFICULTIES[sheet.difficulty as DifficultyEnum] : undefined
  return (
    <li className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-fg-1" lang="ja">
          {sheet?.title ?? change.sheetId}
        </div>
        {sheet && (
          <div className="text-xs text-secondary">
            {sheet.type.toUpperCase()}
            {difficulty && (
              <>
                {' · '}
                <span style={{ color: difficulty.color }} className="font-semibold">
                  {difficulty.title}
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-baseline gap-1.5 text-sm">
        {change.before && <ScoreSummary score={change.before} />}
        <span aria-hidden className="text-secondary">
          →
        </span>
        {change.after ? (
          <span className="text-status-warning">
            <ScoreSummary score={change.after} />
          </span>
        ) : (
          <span className="font-semibold text-danger">
            {m.ratingCalculator_io_import_review_removedChart({}, { locale })}
          </span>
        )}
      </div>
    </li>
  )
}

export interface ImportReviewDialogProps {
  plan: ImportPlan
  trigger: ImportTrigger
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** The preview of an import: what it adds, raises, keeps, lowers and removes, and the risky charts by name */
export const ImportReviewDialog: FC<ImportReviewDialogProps> = ({ plan, trigger, open, onConfirm, onCancel }) => {
  const locale = useLocale()
  const titleId = useId()
  // The import has loaded the complete catalog; until it is there, charts show their sheet ID
  const catalog = useCompleteSongCatalog()
  const source = importSourceLabel(locale, plan.meta.source)
  const risky = plan.risky.length > 0
  // Removing a chart is destructive (danger); lowering a score is a risk (warning)
  const removes = plan.counts.removed > 0
  const changes = planChangesSave(plan)
  const undoHours = Math.round(IMPORT_UNDO_WINDOW_MS / 3_600_000)

  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby={titleId} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle id={titleId}>{m.ratingCalculator_io_import_review_title({ source }, { locale })}</DialogTitle>
      <DialogContent dividers className="flex flex-col gap-4">
        {trigger === 'automatic' && (
          <p className="text-sm text-fg-1">{m.ratingCalculator_io_import_review_automaticHeld({}, { locale })}</p>
        )}
        <p className="text-sm text-secondary text-pretty">
          {plan.meta.mode === 'merge'
            ? m.ratingCalculator_io_import_review_mode_merge({ count: plan.importedCount }, { locale })
            : m.ratingCalculator_io_import_review_mode_replace({ count: plan.importedCount }, { locale })}
        </p>

        <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {COUNT_KINDS.map((kind) => {
            const count = plan.counts[kind]
            const tone = count === 0 ? null : kind === 'removed' ? 'danger' : kind === 'lowered' ? 'warning' : null
            return (
              <div
                key={kind}
                className={clsx(
                  'glass-inset flex flex-col gap-0.5 px-3 py-2',
                  tone === 'danger' && 'outline outline-1 outline-[color-mix(in_oklab,var(--danger)_45%,transparent)]',
                  tone === 'warning' &&
                    'outline outline-1 outline-[color-mix(in_oklab,var(--status-warning)_45%,transparent)]',
                )}
              >
                <dt
                  className={clsx(
                    'text-xs',
                    tone === 'danger'
                      ? 'text-danger font-semibold'
                      : tone === 'warning'
                        ? 'text-status-warning font-semibold'
                        : 'text-secondary',
                  )}
                >
                  {COUNT_LABELS[kind]({}, { locale })}
                </dt>
                <dd
                  className={clsx(
                    'display-num text-xl font-semibold leading-tight',
                    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-status-warning' : 'text-fg-1',
                  )}
                >
                  {count}
                </dd>
              </div>
            )
          })}
        </dl>

        {risky ? (
          <section aria-labelledby={`${titleId}-risky`} className="flex flex-col gap-2">
            <h3
              id={`${titleId}-risky`}
              className={clsx('section-title', removes ? 'text-danger' : 'text-status-warning')}
            >
              {m.ratingCalculator_io_import_review_risky_title({ count: plan.risky.length }, { locale })}
            </h3>
            <ul className="glass-inset max-h-64 overflow-auto overscroll-contain px-3 py-2 divide-y divide-[var(--glass-border)]">
              {plan.risky.slice(0, RISKY_LIST_LIMIT).map((change) => (
                <RiskyChangeRow key={change.sheetId} change={change} sheet={catalog?.getById(change.sheetId)} />
              ))}
            </ul>
            {plan.risky.length > RISKY_LIST_LIMIT && (
              <p className="text-xs text-secondary">
                {m.ratingCalculator_io_import_review_risky_more(
                  { count: plan.risky.length - RISKY_LIST_LIMIT },
                  { locale },
                )}
              </p>
            )}
          </section>
        ) : (
          <p className="text-sm text-status-positive">
            {changes
              ? m.ratingCalculator_io_import_review_safe({}, { locale })
              : m.ratingCalculator_io_import_review_noChanges({}, { locale })}
          </p>
        )}

        <p className="text-xs text-secondary">
          {m.ratingCalculator_io_import_review_undoHint({ count: undoHours }, { locale })}
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          {m.ratingCalculator_io_import_review_cancel({}, { locale })}
        </Button>
        <Button onClick={onConfirm} variant="contained" color={removes ? 'error' : 'primary'}>
          {risky
            ? m.ratingCalculator_io_import_review_confirmRisky({}, { locale })
            : m.ratingCalculator_io_import_review_confirm({}, { locale })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Shows the import preview `reviewAndApplyImport` waits on; mounted once at the root */
export const ImportReviewHost: FC<{ controller?: ImportReviewController }> = ({
  controller = importReviewController,
}) => {
  const request = useSyncExternalStore(controller.subscribe, controller.getRequest, () => null)
  if (!request) return null
  return (
    <ImportReviewDialog
      key={request.id}
      open
      plan={request.plan}
      trigger={request.trigger}
      onConfirm={() => request.resolve(true)}
      onCancel={() => request.resolve(false)}
    />
  )
}