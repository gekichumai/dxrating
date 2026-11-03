import type { SaveDTO } from '@gekichumai/api-contract'
import {
  Alert,
  Button,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
} from '@mui/material'
import { type FC, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiChevronDown from '~icons/mdi/chevron-down'
import { captureAnalyticsEvent, type CloudSaveMigrationMode } from '@/lib/analytics'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import type { Region } from '@/models/context/AppContext'
import { NothingToImportError } from '@/models/scores/cloudImports'
import {
  type CloudMigrationApi,
  findMigrationTarget,
  getDeviceId,
  MigrationConflictError,
  migrationErrorCode,
  type MigrationMode,
  runCloudMigration,
  SaveLimitError,
} from '@/models/scores/cloudMigration'
import { LoadError } from './LoadError'
import './cloud-save.css'

/**
 * "Back up to cloud" (design §10): the first sign-in migration, only ever started here, by the user.
 *
 * - No cloud save yet: one button creates it and uploads this device's records.
 * - A cloud save made elsewhere: merge (the default), use the cloud save only, or, under "Advanced", replace the
 *   cloud save with this device's records after a second confirmation. A replace over a save that changed since it
 *   was loaded (412) loads it again and asks again.
 *
 * Every path first keeps a copy of the local save for 30 days; the local save itself stays as the signed-out save.
 * A failure can be retried as it is: the same keys, nothing to clean up.
 */

export interface CloudMigrationDialogProps {
  open: boolean
  onClose(): void
  /** The local save's entries */
  entries: readonly PlayEntry[]
  /** The selected region (AppContext), for a new save */
  region: Region
  api: CloudMigrationApi
  storage: Storage | null
  /** Makes the save active (`ActiveSave.setActiveSaveId`) */
  onActivate(saveId: string): void
}

type ExistingChoice = 'merge' | 'cloud-only'

type Step =
  | { kind: 'loading' }
  | { kind: 'load-error' }
  | { kind: 'fresh' }
  | { kind: 'existing'; target: SaveDTO; changed?: boolean }
  | { kind: 'confirm-replace'; target: SaveDTO }
  | { kind: 'running'; mode: MigrationMode; target: SaveDTO | null }
  | { kind: 'done'; mode: MigrationMode; uploaded: number; skipped: number }
  | { kind: 'error'; mode: MigrationMode; target: SaveDTO | null; message: string }

const REGION_LABELS: Record<SaveDTO['region'], string> = { jp: 'JP', intl: 'Intl', cn: 'CN', _generic: '' }

const ANALYTICS_MODE: Record<MigrationMode, CloudSaveMigrationMode> = {
  fresh: 'fresh',
  merge: 'merge',
  'cloud-only': 'cloud_only',
  replace: 'replace',
}

export const CloudMigrationDialog: FC<CloudMigrationDialogProps> = ({
  open,
  onClose,
  entries,
  region,
  api,
  storage,
  onActivate,
}) => {
  const { t, i18n } = useTranslation(['rating-calculator'])
  const titleId = useId()
  const [step, setStep] = useState<Step>({ kind: 'loading' })
  const [choice, setChoice] = useState<ExistingChoice>('merge')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
  // One ID per browser, so a retry (in this dialog or after a reload) sends the same keys
  const deviceId = useMemo(() => getDeviceId(storage), [storage])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  const loadSaves = useCallback(
    async (changed = false) => {
      setStep({ kind: 'loading' })
      try {
        const saves = await api.listSaves()
        if (!mounted.current) return
        const target = findMigrationTarget(saves, region)
        setStep(target ? { kind: 'existing', target, changed } : { kind: 'fresh' })
      } catch {
        if (mounted.current) setStep({ kind: 'load-error' })
      }
    },
    [api, region],
  )

  useEffect(() => {
    if (open) void loadSaves()
  }, [open, attempt, loadSaves])

  // The heading of each new step takes the focus: the button that led there is gone
  useEffect(() => {
    if (step.kind !== 'loading') headingRef.current?.focus()
  }, [step.kind])

  const run = async (mode: MigrationMode, target: SaveDTO | null) => {
    setStep({ kind: 'running', mode, target })
    const startedAt = performance.now()
    const recordCount = mode === 'cloud-only' ? 0 : entries.length
    captureAnalyticsEvent('cloudsave_migration_started', { mode: ANALYTICS_MODE[mode], record_count: recordCount })
    try {
      const outcome = await runCloudMigration({
        api,
        entries,
        mode,
        region,
        name: t('rating-calculator:cloud-save.migration.save-name'),
        target,
        deviceId,
        storage,
      })
      captureAnalyticsEvent('cloudsave_migration_succeeded', {
        mode: ANALYTICS_MODE[mode],
        record_count: outcome.uploaded,
        duration_ms: Math.round(performance.now() - startedAt),
      })
      captureAnalyticsEvent('cloudsave_enabled', { via: 'migration' })
      onActivate(outcome.saveId)
      if (mounted.current) setStep({ kind: 'done', mode, uploaded: outcome.uploaded, skipped: outcome.skipped })
    } catch (error) {
      captureAnalyticsEvent('cloudsave_migration_failed', {
        mode: ANALYTICS_MODE[mode],
        error_code: migrationErrorCode(error),
        duration_ms: Math.round(performance.now() - startedAt),
      })
      if (!mounted.current) return
      if (error instanceof MigrationConflictError) {
        // Another device wrote to the save after it was loaded: show it as it is now, and ask again
        await loadSaves(true)
        return
      }
      const message =
        error instanceof SaveLimitError
          ? t('rating-calculator:cloud-save.migration.errors.save-limit')
          : error instanceof NothingToImportError
            ? t('rating-calculator:cloud-save.import.errors.nothing-to-import')
            : t('rating-calculator:cloud-save.migration.errors.generic')
      setStep({ kind: 'error', mode, target, message })
    }
  }

  const busy = step.kind === 'running'
  const close = () => {
    if (!busy) onClose()
  }
  const count = numberFormat.format(entries.length)
  const unverifiedNote = (
    <Alert severity="info" className="text-pretty">
      {t('rating-calculator:cloud-save.migration.unverified-note')}
    </Alert>
  )
  const backupNote = (
    <p className="m-0 text-xs text-zinc-600 text-pretty">{t('rating-calculator:cloud-save.migration.backup-note')}</p>
  )

  const title = (text: string) => (
    <DialogTitle id={titleId} ref={headingRef} tabIndex={-1} className="outline-none text-pretty">
      {text}
    </DialogTitle>
  )

  let body: ReactNode
  switch (step.kind) {
    case 'loading':
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.title'))}
          <DialogContent>
            <output className="flex items-center gap-2 py-2 text-sm text-zinc-600">
              <CircularProgress size="1rem" aria-hidden />
              {t('rating-calculator:cloud-save.saves.loading')}
            </output>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{t('rating-calculator:cloud-save.import-confirm.cancel')}</Button>
          </DialogActions>
        </>
      )
      break
    case 'load-error':
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.title'))}
          <DialogContent>
            <LoadError
              message={t('rating-calculator:cloud-save.saves.error')}
              onRetry={() => setAttempt((value) => value + 1)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{t('rating-calculator:cloud-save.import-confirm.cancel')}</Button>
          </DialogActions>
        </>
      )
      break
    case 'fresh':
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.title'))}
          <DialogContent className="flex flex-col gap-3">
            <DialogContentText className="text-pretty">
              {t('rating-calculator:cloud-save.migration.fresh-description', {
                count: entries.length,
                formatted: count,
              })}
            </DialogContentText>
            {unverifiedNote}
            {backupNote}
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{t('rating-calculator:cloud-save.migration.not-now')}</Button>
            <Button variant="contained" onClick={() => void run('fresh', null)}>
              {t('rating-calculator:cloud-save.migration.back-up')}
            </Button>
          </DialogActions>
        </>
      )
      break
    case 'existing': {
      const { target } = step
      const region = REGION_LABELS[target.region]
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.existing-title'))}
          <DialogContent className="flex flex-col gap-3">
            {step.changed && (
              <Alert severity="warning" className="text-pretty">
                {t('rating-calculator:cloud-save.migration.changed')}
              </Alert>
            )}
            <DialogContentText className="text-pretty">
              {t('rating-calculator:cloud-save.migration.existing-description', {
                name: target.name,
                region: region || t('rating-calculator:cloud-save.saves.region-any'),
                cloudCount: numberFormat.format(target.recordCount),
                count: entries.length,
                formatted: count,
              })}
            </DialogContentText>
            <RadioGroup
              value={choice}
              onChange={(event) => setChoice(event.target.value as ExistingChoice)}
              aria-labelledby={titleId}
              className="gap-1"
            >
              <FormControlLabel
                value="merge"
                control={<Radio size="small" />}
                label={
                  <span className="flex flex-col py-1">
                    <span className="text-sm font-semibold">{t('rating-calculator:cloud-save.migration.merge')}</span>
                    <span className="text-xs text-zinc-600 text-pretty">
                      {t('rating-calculator:cloud-save.migration.merge-description')}
                    </span>
                  </span>
                }
              />
              <FormControlLabel
                value="cloud-only"
                control={<Radio size="small" />}
                label={
                  <span className="flex flex-col py-1">
                    <span className="text-sm font-semibold">
                      {t('rating-calculator:cloud-save.migration.cloud-only')}
                    </span>
                    <span className="text-xs text-zinc-600 text-pretty">
                      {t('rating-calculator:cloud-save.migration.cloud-only-description')}
                    </span>
                  </span>
                }
              />
            </RadioGroup>
            {choice === 'merge' && unverifiedNote}
            {backupNote}
            <div>
              <Button
                size="small"
                color="inherit"
                className="!text-zinc-600"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((value) => !value)}
                endIcon={
                  <IconMdiChevronDown
                    aria-hidden
                    className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                  />
                }
              >
                {t('rating-calculator:cloud-save.migration.advanced')}
              </Button>
              <Collapse in={advancedOpen} unmountOnExit>
                <div className="mt-2 flex flex-col items-start gap-2 rounded-lg bg-zinc-900/4 p-3">
                  <p className="m-0 text-xs text-zinc-600 text-pretty">
                    {t('rating-calculator:cloud-save.migration.replace-description')}
                  </p>
                  <Button size="small" color="error" onClick={() => setStep({ kind: 'confirm-replace', target })}>
                    {t('rating-calculator:cloud-save.migration.replace')}
                  </Button>
                </div>
              </Collapse>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{t('rating-calculator:cloud-save.migration.not-now')}</Button>
            <Button variant="contained" onClick={() => void run(choice, target)}>
              {choice === 'merge'
                ? t('rating-calculator:cloud-save.migration.merge-action')
                : t('rating-calculator:cloud-save.migration.cloud-only-action')}
            </Button>
          </DialogActions>
        </>
      )
      break
    }
    case 'confirm-replace': {
      const { target } = step
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.replace-title'))}
          <DialogContent>
            <Alert severity="warning" className="text-pretty">
              {t('rating-calculator:cloud-save.migration.replace-warning', {
                name: target.name,
                cloudCount: numberFormat.format(target.recordCount),
                count: entries.length,
                formatted: count,
              })}
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStep({ kind: 'existing', target })}>
              {t('rating-calculator:cloud-save.import-confirm.back')}
            </Button>
            <Button color="error" variant="contained" onClick={() => void run('replace', target)}>
              {t('rating-calculator:cloud-save.migration.replace-confirm')}
            </Button>
          </DialogActions>
        </>
      )
      break
    }
    case 'running':
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.running-title'))}
          <DialogContent>
            <output className="flex items-center gap-2 py-2 text-sm text-zinc-600">
              <CircularProgress size="1rem" aria-hidden />
              {t('rating-calculator:cloud-save.migration.running')}
            </output>
          </DialogContent>
        </>
      )
      break
    case 'done':
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.done-title'))}
          <DialogContent className="flex flex-col gap-3">
            <DialogContentText className="text-pretty">
              {step.mode === 'cloud-only'
                ? t('rating-calculator:cloud-save.migration.done-cloud-only')
                : t('rating-calculator:cloud-save.migration.done', {
                    count: step.uploaded,
                    formatted: numberFormat.format(step.uploaded),
                  })}
            </DialogContentText>
            {step.skipped > 0 && (
              <p className="m-0 text-xs text-zinc-600">
                {t('rating-calculator:cloud-save.import.skipped', { count: step.skipped })}
              </p>
            )}
            {step.mode !== 'cloud-only' && unverifiedNote}
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={onClose}>
              {t('rating-calculator:cloud-save.migration.close')}
            </Button>
          </DialogActions>
        </>
      )
      break
    case 'error':
      body = (
        <>
          {title(t('rating-calculator:cloud-save.migration.error-title'))}
          <DialogContent className="flex flex-col gap-3">
            <Alert severity="error" className="text-pretty">
              {step.message}
            </Alert>
            <p className="m-0 text-xs text-zinc-600 text-pretty">
              {t('rating-calculator:cloud-save.migration.error-safe')}
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{t('rating-calculator:cloud-save.migration.close')}</Button>
            <Button variant="contained" onClick={() => void run(step.mode, step.target)}>
              {t('rating-calculator:cloud-save.retry')}
            </Button>
          </DialogActions>
        </>
      )
      break
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      PaperProps={{ className: 'cloud-save-surface', sx: { borderRadius: '0.75rem' } }}
    >
      {body}
    </Dialog>
  )
}