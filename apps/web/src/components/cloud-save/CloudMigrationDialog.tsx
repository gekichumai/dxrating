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
import IconMdiChevronDown from '~icons/mdi/chevron-down'
import { captureAnalyticsEvent, type CloudSaveMigrationMode } from '@/lib/analytics'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import type { Region } from '@/models/context/AppContext'
import { NothingToImportError } from '@/models/scores/cloudImports'
import type { InternalLevelResolver } from '@/models/scores/collapseScoreRecords'
import {
  type CloudMigrationApi,
  findMigrationTarget,
  getDeviceId,
  MigrationCancelledError,
  MigrationConflictError,
  migrationErrorCode,
  type MigrationMode,
  runCloudMigration,
  SaveLimitError,
} from '@/models/scores/cloudMigration'
import { LoadError } from './LoadError'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'
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
 * A failure that a retry can fix (network, server) can be retried as it is: the same keys, nothing to clean up. The
 * save limit and "nothing to upload" say what to do instead.
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
  /** The calculator's internal level resolver (duplicate entries keep the best 50 hint the calculator keeps) */
  resolveInternalLevel?: InternalLevelResolver | null
  /** Makes the save active (`ActiveSave.setActiveSaveId`) */
  onActivate(saveId: string): void
  /**
   * The signed-in account that opens the dialog: the migration only writes while the session is still this account,
   * and stops when the dialog closes
   */
  userId?: string
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
  /** `retryable`: false where the same request can only fail the same way (the save limit, nothing to upload) */
  | {
      kind: 'error'
      mode: MigrationMode
      target: SaveDTO | null
      message: string
      retryable: boolean
    }

const REGION_LABELS: Record<SaveDTO['region'], string> = {
  jp: 'JP',
  intl: 'Intl',
  cn: 'CN',
  _generic: '',
}

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
  resolveInternalLevel,
  onActivate,
  userId,
}) => {
  const locale = useLocale()
  const titleId = useId()
  const [step, setStep] = useState<Step>({ kind: 'loading' })
  const [choice, setChoice] = useState<ExistingChoice>('merge')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale])
  // One ID per browser, so a retry (in this dialog or after a reload) sends the same keys
  const deviceId = useMemo(() => getDeviceId(storage), [storage])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  /** Aborted when the dialog goes: a migration it started sends nothing more and activates nothing */
  const running = useRef<AbortController | null>(null)
  // Set again on every mount: StrictMode (dev) runs the cleanup once before the real mount
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      running.current?.abort()
      running.current = null
    }
  }, [])

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
    captureAnalyticsEvent('cloudsave_migration_started', {
      mode: ANALYTICS_MODE[mode],
      record_count: recordCount,
    })
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    try {
      const outcome = await runCloudMigration({
        api,
        entries,
        mode,
        region,
        name: m.ratingCalculator_cloudSave_migration_saveName({}, { locale }),
        target,
        deviceId,
        storage,
        resolveInternalLevel,
        userId,
        signal: controller.signal,
      })
      // Closed (signed out, another account) while the last request was answered: nothing is activated
      if (controller.signal.aborted) throw new MigrationCancelledError()
      captureAnalyticsEvent('cloudsave_migration_succeeded', {
        mode: ANALYTICS_MODE[mode],
        record_count: outcome.uploaded,
        duration_ms: Math.round(performance.now() - startedAt),
      })
      captureAnalyticsEvent('cloudsave_enabled', { via: 'migration' })
      onActivate(outcome.saveId)
      if (mounted.current)
        setStep({
          kind: 'done',
          mode,
          uploaded: outcome.uploaded,
          skipped: outcome.skipped,
        })
    } catch (error) {
      captureAnalyticsEvent('cloudsave_migration_failed', {
        mode: ANALYTICS_MODE[mode],
        error_code: migrationErrorCode(error),
        duration_ms: Math.round(performance.now() - startedAt),
      })
      if (!mounted.current || controller.signal.aborted) return
      if (error instanceof MigrationConflictError) {
        // Another device wrote to the save after it was loaded: show it as it is now, and ask again
        await loadSaves(true)
        return
      }
      const retryable = !(error instanceof SaveLimitError || error instanceof NothingToImportError)
      const message =
        error instanceof SaveLimitError
          ? m.ratingCalculator_cloudSave_migration_errors_saveLimit({}, { locale })
          : error instanceof NothingToImportError
            ? m.ratingCalculator_cloudSave_import_errors_nothingToImport({}, { locale })
            : mode === 'cloud-only'
              ? m.ratingCalculator_cloudSave_migration_errors_switchGeneric({}, { locale })
              : m.ratingCalculator_cloudSave_migration_errors_generic({}, { locale })
      setStep({ kind: 'error', mode, target, message, retryable })
    }
  }

  const busy = step.kind === 'running'
  const close = () => {
    if (!busy) onClose()
  }
  const count = numberFormat.format(entries.length)
  const unverifiedNote = (
    <Alert severity="info" className="text-pretty">
      {m.ratingCalculator_cloudSave_migration_unverifiedNote({}, { locale })}
    </Alert>
  )
  const backupNote = (
    <p className="m-0 text-xs text-fg-2 text-pretty">
      {m.ratingCalculator_cloudSave_migration_backupNote({}, { locale })}
    </p>
  )

  /** The records of a cloud save, in words ("1 record", "12 records") */
  const cloudRecords = (save: SaveDTO) =>
    m.ratingCalculator_cloudSave_migration_cloudRecords(
      {
        count: save.recordCount,
        formatted: numberFormat.format(save.recordCount),
      },
      { locale },
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
          {title(m.ratingCalculator_cloudSave_migration_title({}, { locale }))}
          <DialogContent>
            <output className="flex items-center gap-2 py-2 text-sm text-fg-2">
              <CircularProgress size="1rem" aria-hidden />
              {m.ratingCalculator_cloudSave_saves_loading({}, { locale })}
            </output>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{m.ratingCalculator_cloudSave_importConfirm_cancel({}, { locale })}</Button>
          </DialogActions>
        </>
      )
      break
    case 'load-error':
      body = (
        <>
          {title(m.ratingCalculator_cloudSave_migration_title({}, { locale }))}
          <DialogContent>
            <LoadError
              message={m.ratingCalculator_cloudSave_saves_error({}, { locale })}
              onRetry={() => setAttempt((value) => value + 1)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{m.ratingCalculator_cloudSave_importConfirm_cancel({}, { locale })}</Button>
          </DialogActions>
        </>
      )
      break
    case 'fresh':
      body = (
        <>
          {title(m.ratingCalculator_cloudSave_migration_title({}, { locale }))}
          <DialogContent className="flex flex-col gap-3">
            <DialogContentText className="text-pretty">
              {m.ratingCalculator_cloudSave_migration_freshDescription(
                {
                  count: entries.length,
                  formatted: count,
                },
                { locale },
              )}
            </DialogContentText>
            {unverifiedNote}
            {backupNote}
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{m.ratingCalculator_cloudSave_migration_notNow({}, { locale })}</Button>
            <Button variant="contained" onClick={() => void run('fresh', null)}>
              {m.ratingCalculator_cloudSave_migration_backUp({}, { locale })}
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
          {title(m.ratingCalculator_cloudSave_migration_existingTitle({}, { locale }))}
          <DialogContent className="flex flex-col gap-3">
            {step.changed && (
              <Alert severity="warning" className="text-pretty">
                {m.ratingCalculator_cloudSave_migration_changed({}, { locale })}
              </Alert>
            )}
            <DialogContentText className="text-pretty">
              {m.ratingCalculator_cloudSave_migration_existingDescription(
                {
                  name: target.name,
                  region: region || m.ratingCalculator_cloudSave_saves_regionAny({}, { locale }),
                  cloudRecords: cloudRecords(target),
                  count: entries.length,
                  formatted: count,
                },
                { locale },
              )}
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
                    <span className="text-sm font-semibold">
                      {m.ratingCalculator_cloudSave_migration_merge({}, { locale })}
                    </span>
                    <span className="text-xs text-fg-2 text-pretty">
                      {m.ratingCalculator_cloudSave_migration_mergeDescription({}, { locale })}
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
                      {m.ratingCalculator_cloudSave_migration_cloudOnly({}, { locale })}
                    </span>
                    <span className="text-xs text-fg-2 text-pretty">
                      {m.ratingCalculator_cloudSave_migration_cloudOnlyDescription({}, { locale })}
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
                className="!text-fg-2"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((value) => !value)}
                endIcon={
                  <IconMdiChevronDown
                    aria-hidden
                    className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                  />
                }
              >
                {m.ratingCalculator_cloudSave_migration_advanced({}, { locale })}
              </Button>
              <Collapse in={advancedOpen} unmountOnExit>
                <div className="mt-2 flex flex-col items-start gap-2 glass-inset p-3">
                  <p className="m-0 text-xs text-fg-2 text-pretty">
                    {m.ratingCalculator_cloudSave_migration_replaceDescription({}, { locale })}
                  </p>
                  <Button size="small" color="error" onClick={() => setStep({ kind: 'confirm-replace', target })}>
                    {m.ratingCalculator_cloudSave_migration_replace({}, { locale })}
                  </Button>
                </div>
              </Collapse>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={close}>{m.ratingCalculator_cloudSave_migration_notNow({}, { locale })}</Button>
            <Button variant="contained" onClick={() => void run(choice, target)}>
              {choice === 'merge'
                ? m.ratingCalculator_cloudSave_migration_mergeAction({}, { locale })
                : m.ratingCalculator_cloudSave_migration_cloudOnlyAction({}, { locale })}
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
          {title(m.ratingCalculator_cloudSave_migration_replaceTitle({}, { locale }))}
          <DialogContent>
            <Alert severity="warning" className="text-pretty">
              {target.recordCount === 0
                ? m.ratingCalculator_cloudSave_migration_replaceWarningEmpty(
                    { name: target.name, count: entries.length, formatted: count },
                    { locale },
                  )
                : m.ratingCalculator_cloudSave_migration_replaceWarning(
                    { name: target.name, cloudRecords: cloudRecords(target), count: entries.length, formatted: count },
                    { locale },
                  )}
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStep({ kind: 'existing', target })}>
              {m.ratingCalculator_cloudSave_importConfirm_back({}, { locale })}
            </Button>
            <Button color="error" variant="contained" onClick={() => void run('replace', target)}>
              {m.ratingCalculator_cloudSave_migration_replaceConfirm({}, { locale })}
            </Button>
          </DialogActions>
        </>
      )
      break
    }
    case 'running':
      body = (
        <>
          {title(
            step.mode === 'cloud-only'
              ? m.ratingCalculator_cloudSave_migration_switchingTitle({}, { locale })
              : m.ratingCalculator_cloudSave_migration_runningTitle({}, { locale }),
          )}
          <DialogContent>
            <output className="flex items-center gap-2 py-2 text-sm text-fg-2">
              <CircularProgress size="1rem" aria-hidden />
              {step.mode === 'cloud-only'
                ? m.ratingCalculator_cloudSave_migration_switching({}, { locale })
                : m.ratingCalculator_cloudSave_migration_running({}, { locale })}
            </output>
          </DialogContent>
        </>
      )
      break
    case 'done':
      body = (
        <>
          {title(
            step.mode === 'cloud-only'
              ? m.ratingCalculator_cloudSave_migration_switchedTitle({}, { locale })
              : m.ratingCalculator_cloudSave_migration_doneTitle({}, { locale }),
          )}
          <DialogContent className="flex flex-col gap-3">
            <DialogContentText className="text-pretty">
              {step.mode === 'cloud-only'
                ? m.ratingCalculator_cloudSave_migration_doneCloudOnly({}, { locale })
                : m.ratingCalculator_cloudSave_migration_done(
                    {
                      count: step.uploaded,
                      formatted: numberFormat.format(step.uploaded),
                    },
                    { locale },
                  )}
            </DialogContentText>
            {step.skipped > 0 && (
              <p className="m-0 text-xs text-fg-2">
                {m.ratingCalculator_cloudSave_import_skipped(
                  {
                    count: step.skipped,
                  },
                  { locale },
                )}
              </p>
            )}
            {step.mode !== 'cloud-only' && unverifiedNote}
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={onClose}>
              {m.ratingCalculator_cloudSave_migration_close({}, { locale })}
            </Button>
          </DialogActions>
        </>
      )
      break
    case 'error':
      body = (
        <>
          {title(
            step.mode === 'cloud-only'
              ? m.ratingCalculator_cloudSave_migration_switchErrorTitle({}, { locale })
              : m.ratingCalculator_cloudSave_migration_errorTitle({}, { locale }),
          )}
          <DialogContent className="flex flex-col gap-3">
            <Alert severity="error" className="text-pretty">
              {step.message}
            </Alert>
            <p className="m-0 text-xs text-fg-2 text-pretty">
              {step.retryable
                ? m.ratingCalculator_cloudSave_migration_errorSafe({}, { locale })
                : m.ratingCalculator_cloudSave_migration_errorUnchanged({}, { locale })}
            </p>
          </DialogContent>
          <DialogActions>
            {step.retryable ? (
              <>
                <Button onClick={close}>{m.ratingCalculator_cloudSave_migration_close({}, { locale })}</Button>
                <Button variant="contained" onClick={() => void run(step.mode, step.target)}>
                  {m.ratingCalculator_cloudSave_retry({}, { locale })}
                </Button>
              </>
            ) : (
              <Button variant="contained" onClick={close}>
                {m.ratingCalculator_cloudSave_migration_close({}, { locale })}
              </Button>
            )}
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
      PaperProps={{
        className: 'cloud-save-surface',
        sx: { borderRadius: '0.75rem' },
      }}
    >
      {body}
    </Dialog>
  )
}