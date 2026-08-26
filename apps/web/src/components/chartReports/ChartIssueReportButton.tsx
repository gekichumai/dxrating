import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  TextField,
} from '@mui/material'
import {
  CHART_REPORT_CATEGORY_KEYS,
  CHART_REPORT_FIELD_KEYS,
  CHART_REPORT_TURNSTILE_ACTION,
  type CHART_REPORT_VALUE_KINDS,
} from '@gekichumai/api-contract'
import {
  type FC,
  type ForwardRefExoticComponent,
  forwardRef,
  type RefAttributes,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import IconMdiAlertOutline from '~icons/mdi/alert-outline'
import IconMdiDeleteOutline from '~icons/mdi/delete-outline'
import IconMdiPlus from '~icons/mdi/plus'
import { useAuth } from '../../hooks/useAuth'
import { apiClient } from '../../lib/orpc'
import type { FlattenedSheet } from '../../songs'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const MAXIMUM_EXPLANATION_LENGTH = 4_000
const MAXIMUM_PROPOSED_VALUE_LENGTH = 4_096
const MAXIMUM_SOURCE_URLS = 5
const MAXIMUM_SOURCE_URL_LENGTH = 2_048

type ChartReportFieldKey = (typeof CHART_REPORT_FIELD_KEYS)[number]
type ChartReportCategoryKey = (typeof CHART_REPORT_CATEGORY_KEYS)[number]
type ChartReportValueKind = (typeof CHART_REPORT_VALUE_KINDS)[number]
type ChartReportJsonSnapshot = string | number | boolean | null | Readonly<Record<string, number>>

export interface ResolvedChartReportContext {
  songId: string
  chartId: string
  fieldKey: ChartReportFieldKey
  publicationRevision: string
  currentValue: ChartReportJsonSnapshot
  valueKind: ChartReportValueKind
}

interface ResolveChartReportContextInput {
  songId: string
  chartType: string
  chartDifficulty: string
  fieldKey: ChartReportFieldKey
}

interface CreateChartReportInput {
  songId: string
  chartId: string
  fieldKey: ChartReportFieldKey
  category: ChartReportCategoryKey
  publicationRevision: string
  currentValue: ChartReportJsonSnapshot
  proposedValue: ChartReportJsonSnapshot
  explanation: string
  sourceUrls: string[]
  turnstileToken: string
}

interface CreatedChartReport {
  id: string
  state: 'open'
  createdAt: string
}

export interface ChartReportChallengeHandle {
  reset: () => void
}

export interface ChartReportChallengeProps {
  siteKey: string
  action: string
  onReady: () => void
  onSuccess: (token: string) => void
  onExpire: () => void
  onError: () => void
}

export type ChartReportChallengeComponent = ForwardRefExoticComponent<
  ChartReportChallengeProps & RefAttributes<ChartReportChallengeHandle>
>

export interface ChartIssueReportDependencies {
  resolveContext: (input: ResolveChartReportContextInput) => Promise<ResolvedChartReportContext>
  createReport: (input: CreateChartReportInput) => Promise<CreatedChartReport>
  ChallengeComponent: ChartReportChallengeComponent
  turnstileSiteKey: string | null | undefined
}

interface ChartIssueReportFormValues {
  fieldKey: ChartReportFieldKey
  category: ChartReportCategoryKey
  proposedValue: string
  explanation: string
  sourceUrls: Array<{ value: string }>
}

type ContextState =
  | { status: 'loading'; context?: ResolvedChartReportContext }
  | { status: 'ready'; context: ResolvedChartReportContext }
  | { status: 'error'; context?: ResolvedChartReportContext }

type TurnstileState = 'loading' | 'ready' | 'expired' | 'error'

interface ActionError {
  key: string
  values?: Record<string, string | number>
}

const DefaultChartReportChallenge = forwardRef<ChartReportChallengeHandle, ChartReportChallengeProps>(
  ({ siteKey, action, onReady, onSuccess, onExpire, onError }, ref) => {
    const turnstileRef = useRef<TurnstileInstance>(null)

    useEffect(() => {
      if (!ref) return
      if (typeof ref === 'function') {
        ref({ reset: () => turnstileRef.current?.reset() })
        return () => ref(null)
      }
      ref.current = { reset: () => turnstileRef.current?.reset() }
      return () => {
        ref.current = null
      }
    }, [ref])

    return (
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        onWidgetLoad={onReady}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onTimeout={onExpire}
        onUnsupported={onError}
        onError={onError}
        options={{
          action,
          appearance: 'always',
          refreshExpired: 'never',
          refreshTimeout: 'never',
          retry: 'never',
          size: 'flexible',
          theme: 'light',
        }}
        style={{ borderRadius: 12, overflow: 'hidden' }}
      />
    )
  },
)
DefaultChartReportChallenge.displayName = 'DefaultChartReportChallenge'

const defaultResolveContext: ChartIssueReportDependencies['resolveContext'] = (input) =>
  apiClient.chartReports.resolveContext(input)

const defaultCreateReport: ChartIssueReportDependencies['createReport'] = (input) =>
  apiClient.chartReports.create(input)

const defaultDependencies: ChartIssueReportDependencies = {
  resolveContext: defaultResolveContext,
  createReport: defaultCreateReport,
  ChallengeComponent: DefaultChartReportChallenge,
  turnstileSiteKey: TURNSTILE_SITE_KEY,
}

const isNullableValueKind = (kind: ChartReportValueKind) => kind.startsWith('nullable_')

const parseProposedValue = (
  rawValue: string,
  valueKind: ChartReportValueKind,
): { success: true; value: ChartReportJsonSnapshot } | { success: false } => {
  const trimmed = rawValue.trim()
  if (trimmed.length === 0 || rawValue.length > MAXIMUM_PROPOSED_VALUE_LENGTH) return { success: false }
  if (isNullableValueKind(valueKind) && trimmed === 'null') return { success: true, value: null }

  if (valueKind === 'string' || valueKind === 'nullable_string') {
    if (trimmed.length > 2_048) return { success: false }
    return { success: true, value: trimmed }
  }

  if (valueKind === 'boolean') {
    if (trimmed === 'true') return { success: true, value: true }
    if (trimmed === 'false') return { success: true, value: false }
    return { success: false }
  }

  if (valueKind === 'nullable_number_map') {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { success: false }
      const entries = Object.entries(parsed)
      if (
        entries.length > 100 ||
        entries.some(
          ([key, value]) =>
            key.length === 0 || key.length > 255 || typeof value !== 'number' || !Number.isFinite(value),
        )
      ) {
        return { success: false }
      }
      return {
        success: true,
        value: Object.fromEntries(entries) as Record<string, number>,
      }
    } catch {
      return { success: false }
    }
  }

  const value = Number(trimmed)
  if (!Number.isFinite(value)) return { success: false }
  if ((valueKind === 'integer' || valueKind === 'nullable_integer') && !Number.isInteger(value)) {
    return { success: false }
  }
  return { success: true, value }
}

const validateSourceUrl = (value: string, messages: { invalid: string; tooLong: string }) => {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.length > MAXIMUM_SOURCE_URL_LENGTH) return messages.tooLong

  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return messages.invalid
    return true
  } catch {
    return messages.invalid
  }
}

const errorDetails = (error: unknown) => {
  if (!error || typeof error !== 'object') return {}
  const candidate = error as {
    code?: unknown
    status?: unknown
    data?: { retryAfterSeconds?: unknown }
  }
  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    status: typeof candidate.status === 'number' ? candidate.status : undefined,
    retryAfterSeconds:
      typeof candidate.data?.retryAfterSeconds === 'number' ? candidate.data.retryAfterSeconds : undefined,
  }
}

const submissionError = (error: unknown): ActionError => {
  const { code, status, retryAfterSeconds } = errorDetails(error)
  switch (code) {
    case 'UNAUTHORIZED':
      return { key: 'sheet:chart-report.errors.authentication-required' }
    case 'CHART_REPORT_VALIDATION_FAILED':
      return { key: 'sheet:chart-report.errors.validation' }
    case 'CHART_REPORT_TURNSTILE_FAILED':
      return { key: 'sheet:chart-report.errors.turnstile-failed' }
    case 'CHART_REPORT_VERIFICATION_UNAVAILABLE':
      return { key: 'sheet:chart-report.errors.verification-unavailable' }
    case 'CHART_REPORT_RATE_LIMITED':
      return {
        key: 'sheet:chart-report.errors.rate-limited',
        values: { retryAfterSeconds: retryAfterSeconds ?? 1 },
      }
    case 'CHART_REPORT_CATALOG_UNAVAILABLE':
      return { key: 'sheet:chart-report.errors.catalog-unavailable' }
    default:
      if (error instanceof TypeError) return { key: 'sheet:chart-report.errors.network' }
      if (status !== undefined && status >= 500) return { key: 'sheet:chart-report.errors.server' }
      return { key: 'sheet:chart-report.errors.unknown' }
  }
}

const formatSnapshot = (value: ChartReportJsonSnapshot, noValueLabel: string) => {
  if (value === null) return noValueLabel
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

const ProposedValueField: FC<{
  control: ReturnType<typeof useForm<ChartIssueReportFormValues>>['control']
  valueKind: ChartReportValueKind
  disabled: boolean
}> = ({ control, valueKind, disabled }) => {
  const { t } = useTranslation(['sheet'])
  const isBoolean = valueKind === 'boolean'

  return (
    <Controller
      name="proposedValue"
      control={control}
      rules={{
        required: t('sheet:chart-report.validation.proposed-value-required'),
        validate: (value) =>
          parseProposedValue(value, valueKind).success || t('sheet:chart-report.validation.proposed-value-invalid'),
      }}
      render={({ field, fieldState }) =>
        isBoolean ? (
          <TextField
            {...field}
            select
            SelectProps={{ native: true }}
            label={t('sheet:chart-report.form.proposed-value.label')}
            helperText={fieldState.error?.message ?? t('sheet:chart-report.form.proposed-value.helper')}
            error={!!fieldState.error}
            disabled={disabled}
            fullWidth
          >
            <option value="">{t('sheet:chart-report.form.proposed-value.placeholder')}</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </TextField>
        ) : (
          <TextField
            {...field}
            label={t('sheet:chart-report.form.proposed-value.label')}
            placeholder={t('sheet:chart-report.form.proposed-value.placeholder')}
            helperText={fieldState.error?.message ?? t('sheet:chart-report.form.proposed-value.helper')}
            error={!!fieldState.error}
            disabled={disabled}
            type={valueKind === 'number' || valueKind === 'integer' ? 'number' : 'text'}
            inputProps={{
              maxLength: MAXIMUM_PROPOSED_VALUE_LENGTH,
              step: valueKind === 'integer' || valueKind === 'nullable_integer' ? 1 : 0.001,
            }}
            minRows={valueKind === 'nullable_number_map' ? 3 : 1}
            multiline={valueKind === 'nullable_number_map' || valueKind === 'nullable_string'}
            fullWidth
          />
        )
      }
    />
  )
}

export interface ChartIssueReportFormProps {
  sheet: FlattenedSheet
  onClose: () => void
  titleId?: string
  onPendingChange?: (pending: boolean) => void
  dependencies?: Partial<ChartIssueReportDependencies>
}

export const ChartIssueReportForm: FC<ChartIssueReportFormProps> = ({
  sheet,
  onClose,
  titleId,
  onPendingChange,
  dependencies,
}) => {
  const { t } = useTranslation(['sheet'])
  const generatedTitleId = useId()
  const dialogTitleId = titleId ?? generatedTitleId
  const resolveContext = dependencies?.resolveContext ?? defaultDependencies.resolveContext
  const createReport = dependencies?.createReport ?? defaultDependencies.createReport
  const ChallengeComponent = dependencies?.ChallengeComponent ?? defaultDependencies.ChallengeComponent
  const turnstileSiteKey =
    dependencies && 'turnstileSiteKey' in dependencies
      ? dependencies.turnstileSiteKey
      : defaultDependencies.turnstileSiteKey
  const challengeRef = useRef<ChartReportChallengeHandle>(null)
  const requestSequence = useRef(0)
  const [contextState, setContextState] = useState<ContextState>({
    status: 'loading',
  })
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileState, setTurnstileState] = useState<TurnstileState>('loading')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<ActionError | null>(null)
  const [staleReviewRequired, setStaleReviewRequired] = useState(false)
  const [createdReport, setCreatedReport] = useState<CreatedChartReport | null>(null)

  const form = useForm<ChartIssueReportFormValues>({
    mode: 'onBlur',
    defaultValues: {
      fieldKey: 'chart.level',
      category: 'incorrect_value',
      proposedValue: '',
      explanation: '',
      sourceUrls: [{ value: '' }],
    },
  })
  const { control, register, handleSubmit, setValue, watch, formState } = form
  const sourceUrls = useFieldArray({ control, name: 'sourceUrls' })
  const fieldKey = watch('fieldKey')

  const invalidateChallenge = useCallback(() => {
    challengeRef.current?.reset()
    setTurnstileToken(null)
    setTurnstileState(turnstileSiteKey ? 'ready' : 'error')
  }, [turnstileSiteKey])

  const loadContext = useCallback(
    async (preserveStaleNotice = false) => {
      const requestId = ++requestSequence.current
      setContextState((current) => ({
        status: 'loading',
        context: current.context?.fieldKey === fieldKey ? current.context : undefined,
      }))
      setActionError(null)
      try {
        const context = await resolveContext({
          songId: sheet.songId,
          chartType: sheet.type,
          chartDifficulty: sheet.difficulty,
          fieldKey,
        })
        if (requestSequence.current !== requestId) return
        if (context.fieldKey !== fieldKey) throw new Error('Chart report context field mismatch')
        setContextState({ status: 'ready', context })
        if (!preserveStaleNotice) setStaleReviewRequired(false)
      } catch {
        if (requestSequence.current !== requestId) return
        setContextState((current) => ({
          status: 'error',
          context: current.context,
        }))
      }
    },
    [fieldKey, resolveContext, sheet.difficulty, sheet.songId, sheet.type],
  )

  useEffect(() => {
    void loadContext()
    return () => {
      requestSequence.current += 1
    }
  }, [loadContext])

  useEffect(() => {
    onPendingChange?.(submitting)
  }, [onPendingChange, submitting])

  const currentContext = contextState.context?.fieldKey === fieldKey ? contextState.context : undefined
  const valueKind = currentContext?.valueKind ?? 'string'

  const submit = handleSubmit(
    async (values) => {
      setActionError(null)
      if (contextState.status !== 'ready' || contextState.context.fieldKey !== values.fieldKey) {
        setActionError({ key: 'sheet:chart-report.context.error' })
        return
      }
      if (!turnstileSiteKey || !turnstileToken) {
        setTurnstileState(turnstileSiteKey ? 'expired' : 'error')
        setActionError({
          key: 'sheet:chart-report.validation.turnstile-required',
        })
        return
      }

      const proposedValue = parseProposedValue(values.proposedValue, contextState.context.valueKind)
      if (!proposedValue.success) {
        setActionError({
          key: 'sheet:chart-report.validation.proposed-value-invalid',
        })
        return
      }

      setSubmitting(true)
      try {
        const created = await createReport({
          songId: contextState.context.songId,
          chartId: contextState.context.chartId,
          fieldKey: values.fieldKey,
          category: values.category,
          publicationRevision: contextState.context.publicationRevision,
          currentValue: contextState.context.currentValue,
          proposedValue: proposedValue.value,
          explanation: values.explanation.trim(),
          sourceUrls: values.sourceUrls.map(({ value }) => value.trim()).filter(Boolean),
          turnstileToken,
        })
        invalidateChallenge()
        setCreatedReport(created)
      } catch (error) {
        invalidateChallenge()
        if (errorDetails(error).code === 'CHART_REPORT_STALE_PUBLICATION') {
          setStaleReviewRequired(true)
          await loadContext(true)
        } else {
          setActionError(submissionError(error))
        }
      } finally {
        setSubmitting(false)
      }
    },
    () => setActionError({ key: 'sheet:chart-report.validation.form-invalid' }),
  )

  if (createdReport) {
    return (
      <>
        <DialogTitle id={dialogTitleId} className="text-wrap-balance">
          {t('sheet:chart-report.success.title')}
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" className="!mb-3">
            {t('sheet:chart-report.success.acknowledgement')}
          </Alert>
          <div className="flex flex-col gap-3 text-wrap-pretty">
            <code className="font-mono tabular-nums break-all">
              {t('sheet:chart-report.success.report-id', { reportId: createdReport.id })}
            </code>
            <p className="text-sm text-zinc-600">{t('sheet:chart-report.success.disclaimer')}</p>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="contained" sx={{ minHeight: 40 }}>
            {t('sheet:chart-report.success.close')}
          </Button>
        </DialogActions>
      </>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogTitle id={dialogTitleId} className="text-wrap-balance">
        {t('sheet:chart-report.title')}
      </DialogTitle>
      <DialogContent dividers className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600 text-wrap-pretty">{t('sheet:chart-report.description')}</p>

        <Controller
          name="fieldKey"
          control={control}
          rules={{
            required: t('sheet:chart-report.validation.field-required'),
          }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              SelectProps={{ native: true }}
              label={t('sheet:chart-report.form.field.label')}
              helperText={fieldState.error?.message ?? t('sheet:chart-report.form.field.helper')}
              error={!!fieldState.error}
              disabled={submitting}
              onChange={(event) => {
                const nextField = event.target.value as ChartReportFieldKey
                if (nextField !== field.value) {
                  setValue('proposedValue', '', {
                    shouldDirty: false,
                    shouldValidate: false,
                  })
                  setStaleReviewRequired(false)
                  invalidateChallenge()
                }
                field.onChange(event)
              }}
              fullWidth
            >
              {CHART_REPORT_FIELD_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`sheet:chart-report.fields.${key}`)}
                </option>
              ))}
            </TextField>
          )}
        />

        {contextState.status === 'loading' && (
          <output className="flex items-center gap-2 text-sm text-zinc-600">
            <CircularProgress size={18} />
            <span>{t('sheet:chart-report.context.loading')}</span>
          </output>
        )}

        {contextState.status === 'error' && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void loadContext(staleReviewRequired)}>
                {t('sheet:chart-report.context.retry')}
              </Button>
            }
          >
            {t('sheet:chart-report.context.error')}
          </Alert>
        )}

        {currentContext && (
          <Paper variant="outlined" className="p-3 !rounded-xl">
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-zinc-500">{t('sheet:chart-report.context.song-id')}</dt>
              <dd className="font-mono break-all">{currentContext.songId}</dd>
              <dt className="text-zinc-500">{t('sheet:chart-report.context.chart-id')}</dt>
              <dd className="font-mono break-all">{currentContext.chartId}</dd>
              <dt className="text-zinc-500">{t('sheet:chart-report.context.revision')}</dt>
              <dd className="font-mono tabular-nums break-all">{currentContext.publicationRevision}</dd>
              <dt className="text-zinc-500">{t('sheet:chart-report.context.field')}</dt>
              <dd>{t(`sheet:chart-report.fields.${currentContext.fieldKey}`)}</dd>
              <dt className="text-zinc-500">{t('sheet:chart-report.context.current-value')}</dt>
              <dd className="font-mono whitespace-pre-wrap break-all">
                {formatSnapshot(currentContext.currentValue, t('sheet:chart-report.context.no-value'))}
              </dd>
            </dl>
          </Paper>
        )}

        {staleReviewRequired && contextState.status === 'ready' && contextState.context.fieldKey === fieldKey && (
          <Alert severity="warning" icon={<IconMdiAlertOutline />}>
            <div className="font-bold">{t('sheet:chart-report.stale.title')}</div>
            <p>
              {t('sheet:chart-report.stale.description', {
                revision: contextState.context.publicationRevision,
              })}
            </p>
            <p className="mt-1">{t('sheet:chart-report.stale.current-context')}</p>
            <p className="mt-1">{t('sheet:chart-report.stale.proposal-preserved')}</p>
            <p className="mt-1 font-bold">{t('sheet:chart-report.stale.review-required')}</p>
          </Alert>
        )}

        <Controller
          name="category"
          control={control}
          rules={{
            required: t('sheet:chart-report.validation.category-required'),
          }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              SelectProps={{ native: true }}
              label={t('sheet:chart-report.form.category.label')}
              helperText={fieldState.error?.message ?? t('sheet:chart-report.form.category.helper')}
              error={!!fieldState.error}
              disabled={submitting}
              fullWidth
            >
              {CHART_REPORT_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`sheet:chart-report.categories.${key}`)}
                </option>
              ))}
            </TextField>
          )}
        />

        <ProposedValueField
          control={control}
          valueKind={valueKind}
          disabled={submitting || contextState.status !== 'ready' || !currentContext}
        />

        <TextField
          {...register('explanation', {
            required: t('sheet:chart-report.validation.explanation-required'),
            validate: (value) => value.trim().length > 0 || t('sheet:chart-report.validation.explanation-required'),
            maxLength: {
              value: MAXIMUM_EXPLANATION_LENGTH,
              message: t('sheet:chart-report.validation.explanation-too-long', {
                max: MAXIMUM_EXPLANATION_LENGTH,
              }),
            },
          })}
          label={t('sheet:chart-report.form.explanation.label')}
          placeholder={t('sheet:chart-report.form.explanation.placeholder')}
          helperText={
            formState.errors.explanation?.message ??
            t('sheet:chart-report.form.explanation.helper', {
              max: MAXIMUM_EXPLANATION_LENGTH,
            })
          }
          error={!!formState.errors.explanation}
          disabled={submitting}
          inputProps={{ maxLength: MAXIMUM_EXPLANATION_LENGTH }}
          minRows={4}
          multiline
          fullWidth
        />

        <fieldset className="flex flex-col gap-2 min-w-0">
          <legend className="text-sm font-medium">{t('sheet:chart-report.form.source-urls.label')}</legend>
          <p className="text-xs text-zinc-500 text-wrap-pretty">
            {t('sheet:chart-report.form.source-urls.helper', {
              max: MAXIMUM_SOURCE_URLS,
            })}
          </p>
          {sourceUrls.fields.map((sourceUrl, index) => (
            <div key={sourceUrl.id} className="flex items-start gap-1">
              <TextField
                {...register(`sourceUrls.${index}.value`, {
                  validate: (value) =>
                    validateSourceUrl(value, {
                      invalid: t('sheet:chart-report.validation.source-url-invalid'),
                      tooLong: t('sheet:chart-report.validation.source-url-too-long', {
                        max: MAXIMUM_SOURCE_URL_LENGTH,
                      }),
                    }),
                })}
                label={t('sheet:chart-report.form.source-urls.item-label', {
                  index: index + 1,
                })}
                placeholder={t('sheet:chart-report.form.source-urls.placeholder')}
                helperText={formState.errors.sourceUrls?.[index]?.value?.message}
                error={!!formState.errors.sourceUrls?.[index]?.value}
                disabled={submitting}
                inputProps={{ maxLength: MAXIMUM_SOURCE_URL_LENGTH }}
                type="url"
                fullWidth
              />
              <IconButton
                onClick={() => sourceUrls.remove(index)}
                disabled={submitting || sourceUrls.fields.length === 1}
                aria-label={t('sheet:chart-report.form.source-urls.remove', {
                  index: index + 1,
                })}
                sx={{ minWidth: 40, minHeight: 40, mt: 1 }}
              >
                <IconMdiDeleteOutline />
              </IconButton>
            </div>
          ))}
          <Button
            type="button"
            variant="outlined"
            startIcon={<IconMdiPlus />}
            onClick={() => sourceUrls.append({ value: '' })}
            disabled={submitting || sourceUrls.fields.length >= MAXIMUM_SOURCE_URLS}
            sx={{ minHeight: 40, alignSelf: 'flex-start' }}
          >
            {t('sheet:chart-report.form.source-urls.add')}
          </Button>
        </fieldset>

        <fieldset className="flex flex-col gap-2 min-w-0">
          <legend className="text-sm font-medium">{t('sheet:chart-report.turnstile.label')}</legend>
          {turnstileSiteKey ? (
            <ChallengeComponent
              ref={challengeRef}
              siteKey={turnstileSiteKey}
              action={CHART_REPORT_TURNSTILE_ACTION}
              onReady={() => setTurnstileState('ready')}
              onSuccess={(token) => {
                setTurnstileToken(token)
                setTurnstileState('ready')
              }}
              onExpire={() => {
                setTurnstileToken(null)
                setTurnstileState('expired')
              }}
              onError={() => {
                setTurnstileToken(null)
                setTurnstileState('error')
              }}
            />
          ) : (
            <Alert severity="error">{t('sheet:chart-report.errors.verification-unavailable')}</Alert>
          )}
          {turnstileState === 'loading' && turnstileSiteKey && (
            <output className="flex items-center gap-2 text-sm text-zinc-600">
              <CircularProgress size={18} />
              <span>{t('sheet:chart-report.turnstile.loading')}</span>
            </output>
          )}
          {(turnstileState === 'error' || turnstileState === 'expired') && turnstileSiteKey && (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    challengeRef.current?.reset()
                    setTurnstileToken(null)
                    setTurnstileState('ready')
                  }}
                >
                  {t('sheet:chart-report.turnstile.retry')}
                </Button>
              }
            >
              {t(
                turnstileState === 'expired'
                  ? 'sheet:chart-report.turnstile.expired'
                  : 'sheet:chart-report.turnstile.error',
              )}
            </Alert>
          )}
        </fieldset>

        {actionError && <Alert severity="error">{t(actionError.key, actionError.values ?? {})}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose} disabled={submitting} sx={{ minHeight: 40 }}>
          {t('sheet:chart-report.actions.cancel')}
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting || contextState.status !== 'ready' || !turnstileSiteKey || !turnstileToken}
          sx={{ minHeight: 40 }}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <CircularProgress size={18} color="inherit" />
              {t('sheet:chart-report.actions.submitting')}
            </span>
          ) : staleReviewRequired ? (
            t('sheet:chart-report.stale.resubmit')
          ) : (
            t('sheet:chart-report.actions.submit')
          )}
        </Button>
      </DialogActions>
    </form>
  )
}

export interface ChartIssueReportButtonProps {
  sheet: FlattenedSheet
  dependencies?: Partial<ChartIssueReportDependencies>
}

export const ChartIssueReportButton: FC<ChartIssueReportButtonProps> = ({ sheet, dependencies }) => {
  const { t } = useTranslation(['sheet'])
  const { session, openLoginDialog, LoginDialog } = useAuth()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const dialogTitleId = useId()

  const formDependencies = useMemo(() => dependencies, [dependencies])

  return (
    <>
      <LoginDialog />
      <Button
        type="button"
        variant="outlined"
        size="small"
        startIcon={<IconMdiAlertOutline />}
        onClick={() => {
          if (!session) {
            openLoginDialog()
            return
          }
          setOpen(true)
        }}
        sx={{ minHeight: 40 }}
      >
        {t('sheet:chart-report.open')}
      </Button>
      <Dialog
        open={open}
        aria-labelledby={dialogTitleId}
        onClose={() => {
          if (!pending) setOpen(false)
        }}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        {open && (
          <ChartIssueReportForm
            sheet={sheet}
            titleId={dialogTitleId}
            dependencies={formDependencies}
            onClose={() => setOpen(false)}
            onPendingChange={setPending}
          />
        )}
      </Dialog>
    </>
  )
}