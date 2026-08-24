import { ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { Alert, Button, Code, Group, Modal, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { useAdminAuthActions } from '../auth/admin-auth-context'
import { useAdminData } from '../data/admin-data-context'
import { normalizeAdminError, type AdminErrorKind } from '../data/admin-errors'
import { invalidateAfterReportMutation } from '../data/invalidation'
import { validateChartReportCloseNote } from './chart-report-close-form-model'
import classes from './chart-report-close-controls.module.css'

type ChartReportDetailOutput = AdminContractOutputs['getChartReportDetail']

export type ChartReportCloseControlsLabels = {
  readonly cancel: string
  readonly confirm: string
  readonly confirmDescription: string
  readonly confirmTitle: string
  readonly description: string
  readonly errors: {
    readonly conflict: string
    readonly forbidden: string
    readonly generic: string
  }
  readonly noteDescription: string
  readonly noteLabel: string
  readonly notePlaceholder: string
  readonly noteTooLong: string
  readonly openAction: string
  readonly refresh: string
  readonly retry: string
  readonly success: string
  readonly target: string
  readonly title: string
}

export type ChartReportCloseControlsProps = {
  readonly detail: ChartReportDetailOutput
  readonly labels: ChartReportCloseControlsLabels
}

const errorCopy = (kind: AdminErrorKind, labels: ChartReportCloseControlsLabels): string => {
  if (kind === 'conflict') return labels.errors.conflict
  if (kind === 'forbidden') return labels.errors.forbidden
  return labels.errors.generic
}

export const ChartReportCloseControls = ({ detail, labels }: ChartReportCloseControlsProps) => {
  const data = useAdminData()
  const authActions = useAdminAuthActions()
  const queryClient = useQueryClient()
  const titleId = useId()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [errorKind, setErrorKind] = useState<AdminErrorKind | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const subjectReportIdRef = useRef(detail.report.id)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    subjectReportIdRef.current = detail.report.id
    abortRef.current?.abort()
    abortRef.current = null
    inFlightRef.current = false
    setNote('')
    setNoteError(null)
    setConfirmationOpen(false)
    setPending(false)
    setErrorKind(null)
  }, [detail.report.id])

  if (detail.report.state === 'closed') return null

  const refreshAuthoritativeState = async (
    reportId = detail.report.id,
    chartId = detail.report.capturedContext.chart.chartId,
  ) => {
    await invalidateAfterReportMutation(queryClient, { reportId, chartId })
  }

  const validateNote = () => {
    const result = validateChartReportCloseNote(note)
    if (result.ok) {
      setNoteError(null)
      return result.internalNote
    }
    setNoteError(labels.noteTooLong)
    return undefined
  }

  const requestConfirmation = () => {
    if (inFlightRef.current || validateNote() === undefined) return
    setErrorKind(null)
    setConfirmationOpen(true)
  }

  const closeReport = async () => {
    if (inFlightRef.current || detail.report.state !== 'open') return
    const internalNote = validateNote()
    if (internalNote === undefined) {
      setConfirmationOpen(false)
      return
    }

    const reportId = detail.report.id
    const chartId = detail.report.capturedContext.chart.chartId
    inFlightRef.current = true
    setPending(true)
    setErrorKind(null)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      await data.client.closeChartReport(
        {
          body: { expectedState: 'open', internalNote },
          params: { reportId },
        },
        { signal: abort.signal },
      )
      await refreshAuthoritativeState(reportId, chartId)
      if (!mountedRef.current || subjectReportIdRef.current !== reportId) return
      setNote('')
      setNoteError(null)
      setConfirmationOpen(false)
      notifications.show({ color: 'green', message: labels.success })
    } catch (caught) {
      const presentation = normalizeAdminError(caught)
      if (presentation.kind === 'cancelled') return
      if (presentation.kind === 'conflict') await refreshAuthoritativeState(reportId, chartId)
      authActions.reportFeatureError(caught)
      if (mountedRef.current && subjectReportIdRef.current === reportId) {
        setConfirmationOpen(false)
        setErrorKind(presentation.kind)
      }
    } finally {
      if (subjectReportIdRef.current === reportId) {
        abortRef.current = null
        inFlightRef.current = false
        if (mountedRef.current) setPending(false)
      }
    }
  }

  return (
    <Paper aria-labelledby={titleId} className={classes.root} component="section" p="lg" radius="lg" withBorder>
      <Stack gap="md">
        <Title id={titleId} order={2} size="h3">
          {labels.title}
        </Title>
        <Text className={classes.description} c="dimmed" size="sm">
          {labels.description}
        </Text>

        {errorKind ? (
          <Alert color="red" role="alert">
            <Stack gap="sm">
              <Text size="sm">{errorCopy(errorKind, labels)}</Text>
              <Group gap="sm" wrap="wrap">
                {errorKind === 'conflict' ? (
                  <Button
                    className={classes.action}
                    onClick={() => void refreshAuthoritativeState()}
                    size="md"
                    variant="default"
                  >
                    {labels.refresh}
                  </Button>
                ) : (
                  <Button className={classes.action} onClick={requestConfirmation} size="md" variant="default">
                    {labels.retry}
                  </Button>
                )}
              </Group>
            </Stack>
          </Alert>
        ) : null}

        <Textarea
          description={labels.noteDescription}
          error={noteError}
          label={labels.noteLabel}
          maxLength={ADMIN_CHART_REPORT_CLOSE_NOTE_MAX_LENGTH + 1}
          minRows={4}
          onChange={(event) => {
            setNote(event.currentTarget.value)
            setNoteError(null)
          }}
          placeholder={labels.notePlaceholder}
          value={note}
        />
        <Button className={classes.action} color="red" loading={pending} onClick={requestConfirmation} size="md">
          {labels.openAction}
        </Button>

        <Modal
          centered
          closeButtonProps={{ 'aria-label': labels.cancel }}
          onClose={() => {
            if (!pending) setConfirmationOpen(false)
          }}
          opened={confirmationOpen}
          title={labels.confirmTitle}
        >
          <Stack gap="md">
            <Text className={classes.description}>{labels.confirmDescription}</Text>
            <Stack gap={4}>
              <Text c="dimmed" size="sm">
                {labels.target}
              </Text>
              <Code className={classes.identifier}>{detail.report.id}</Code>
            </Stack>
            <Group justify="flex-end" wrap="wrap">
              <Button
                className={classes.action}
                disabled={pending}
                onClick={() => setConfirmationOpen(false)}
                size="md"
                variant="default"
              >
                {labels.cancel}
              </Button>
              <Button
                className={classes.action}
                color="red"
                loading={pending}
                onClick={() => void closeReport()}
                size="md"
              >
                {labels.confirm}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Paper>
  )
}