import {
  ADMIN_CHART_REPORT_CATEGORY_KEYS,
  ADMIN_CHART_REPORT_FIELD_KEYS,
  type AdminChartReportCategoryKey,
  type AdminChartReportFieldKey,
} from '@gekichumai/admin-contract'
import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconEraser, IconFilter } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import {
  chartReportListFilterDraftFromSearch,
  hasChartReportListFilters,
  parseChartReportListFilterDraft,
  type ChartReportListFilterDraft,
  type ChartReportListFilterError,
  type ChartReportListFilterField,
  type ChartReportListFilters,
  type ChartReportListSearch,
} from './chart-report-route-search'

export type ChartReportSearchFormLabels = {
  readonly title: string
  readonly description: string
  readonly formLabel: string
  readonly state: string
  readonly anyState: string
  readonly openState: string
  readonly closedState: string
  readonly chartId: string
  readonly chartIdPlaceholder: string
  readonly fieldKey: string
  readonly anyField: string
  readonly fieldLabels: Readonly<Record<AdminChartReportFieldKey, string>>
  readonly category: string
  readonly anyCategory: string
  readonly categoryLabels: Readonly<Record<AdminChartReportCategoryKey, string>>
  readonly reporterUserId: string
  readonly reporterUserIdPlaceholder: string
  readonly submittedAtFromInclusive: string
  readonly submittedAtBeforeExclusive: string
  readonly localTimeDescription: string
  readonly publicationRevision: string
  readonly publicationRevisionPlaceholder: string
  readonly clear: string
  readonly submit: string
  readonly validation: {
    readonly state: string
    readonly chartId: string
    readonly fieldKey: string
    readonly category: string
    readonly reporterUserId: string
    readonly submittedAtFromInclusive: string
    readonly submittedAtBeforeExclusive: string
    readonly publicationRevision: string
    readonly dateOrder: string
  }
}

export type ChartReportSearchFormProps = {
  readonly disabled?: boolean
  readonly labels: ChartReportSearchFormLabels
  readonly search: ChartReportListSearch
  readonly onClear: () => void
  readonly onSubmit: (filters: ChartReportListFilters) => void
}

const replaceDraftField = <TField extends ChartReportListFilterField>(
  draft: ChartReportListFilterDraft,
  field: TField,
  value: ChartReportListFilterDraft[TField],
): ChartReportListFilterDraft => ({ ...draft, [field]: value })

const draftHasValues = (draft: ChartReportListFilterDraft): boolean =>
  Object.values(draft).some((value) => value.length > 0)

const searchHasRestorableState = (search: ChartReportListSearch): boolean =>
  hasChartReportListFilters(search) || search.cursor !== undefined

export const ChartReportSearchForm = ({
  disabled = false,
  labels,
  search,
  onClear,
  onSubmit,
}: ChartReportSearchFormProps) => {
  const [draft, setDraft] = useState(() => chartReportListFilterDraftFromSearch(search))
  const [errors, setErrors] = useState<Partial<Record<ChartReportListFilterField, ChartReportListFilterError>>>({})

  useEffect(() => {
    setDraft(chartReportListFilterDraftFromSearch(search))
    setErrors({})
  }, [
    search.category,
    search.chartId,
    search.fieldKey,
    search.publicationRevision,
    search.reporterUserId,
    search.state,
    search.submittedAtBeforeExclusive,
    search.submittedAtFromInclusive,
  ])

  const update = <TField extends ChartReportListFilterField>(
    field: TField,
    value: ChartReportListFilterDraft[TField],
  ) => {
    setDraft((current) => replaceDraftField(current, field, value))
    setErrors((current) => {
      const clearsOrderedBound =
        (field === 'submittedAtFromInclusive' || field === 'submittedAtBeforeExclusive') &&
        current.submittedAtBeforeExclusive === 'order'
      if (current[field] === undefined && !clearsOrderedBound) return current
      const next = { ...current }
      delete next[field]
      if (clearsOrderedBound) delete next.submittedAtBeforeExclusive
      return next
    })
  }

  const validationMessage = (field: ChartReportListFilterField): string | undefined => {
    const error = errors[field]
    if (error === undefined) return undefined
    if (error === 'order') return labels.validation.dateOrder
    return labels.validation[field]
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = parseChartReportListFilterDraft(draft)
    if (!parsed.success) {
      setErrors(parsed.errors)
      return
    }
    setDraft(chartReportListFilterDraftFromSearch(parsed.value))
    setErrors({})
    onSubmit(parsed.value)
  }

  const clear = () => {
    setDraft(chartReportListFilterDraftFromSearch({}))
    setErrors({})
    onClear()
  }

  return (
    <Paper component="section" p="lg" radius="lg" shadow="xs" withBorder>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={2} size="h3">
            {labels.title}
          </Title>
          <Text c="dimmed" size="sm">
            {labels.description}
          </Text>
        </Stack>

        <form aria-label={labels.formLabel} noValidate onSubmit={submit}>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="sm">
              <Select
                allowDeselect={false}
                data={[
                  { value: '', label: labels.anyState },
                  { value: 'open', label: labels.openState },
                  { value: 'closed', label: labels.closedState },
                ]}
                disabled={disabled}
                error={validationMessage('state')}
                label={labels.state}
                onChange={(value) => update('state', (value ?? '') as ChartReportListFilterDraft['state'])}
                size="md"
                value={draft.state}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                disabled={disabled}
                error={validationMessage('chartId')}
                label={labels.chartId}
                onChange={(event) => update('chartId', event.currentTarget.value)}
                placeholder={labels.chartIdPlaceholder}
                size="md"
                spellCheck={false}
                value={draft.chartId}
              />
              <Select
                allowDeselect={false}
                data={[
                  { value: '', label: labels.anyField },
                  ...ADMIN_CHART_REPORT_FIELD_KEYS.map((value) => ({
                    value,
                    label: labels.fieldLabels[value],
                  })),
                ]}
                disabled={disabled}
                error={validationMessage('fieldKey')}
                label={labels.fieldKey}
                maxDropdownHeight={360}
                onChange={(value) => update('fieldKey', (value ?? '') as ChartReportListFilterDraft['fieldKey'])}
                searchable
                size="md"
                value={draft.fieldKey}
              />
              <Select
                allowDeselect={false}
                data={[
                  { value: '', label: labels.anyCategory },
                  ...ADMIN_CHART_REPORT_CATEGORY_KEYS.map((value) => ({
                    value,
                    label: labels.categoryLabels[value],
                  })),
                ]}
                disabled={disabled}
                error={validationMessage('category')}
                label={labels.category}
                onChange={(value) => update('category', (value ?? '') as ChartReportListFilterDraft['category'])}
                size="md"
                value={draft.category}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                disabled={disabled}
                error={validationMessage('reporterUserId')}
                label={labels.reporterUserId}
                onChange={(event) => update('reporterUserId', event.currentTarget.value)}
                placeholder={labels.reporterUserIdPlaceholder}
                size="md"
                spellCheck={false}
                value={draft.reporterUserId}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                disabled={disabled}
                error={validationMessage('publicationRevision')}
                inputMode="numeric"
                label={labels.publicationRevision}
                onChange={(event) => update('publicationRevision', event.currentTarget.value)}
                placeholder={labels.publicationRevisionPlaceholder}
                size="md"
                spellCheck={false}
                value={draft.publicationRevision}
              />
              <TextInput
                autoComplete="off"
                description={labels.localTimeDescription}
                disabled={disabled}
                error={validationMessage('submittedAtFromInclusive')}
                label={labels.submittedAtFromInclusive}
                onChange={(event) => update('submittedAtFromInclusive', event.currentTarget.value)}
                size="md"
                step={60}
                type="datetime-local"
                value={draft.submittedAtFromInclusive}
              />
              <TextInput
                autoComplete="off"
                description={labels.localTimeDescription}
                disabled={disabled}
                error={validationMessage('submittedAtBeforeExclusive')}
                label={labels.submittedAtBeforeExclusive}
                onChange={(event) => update('submittedAtBeforeExclusive', event.currentTarget.value)}
                size="md"
                step={60}
                type="datetime-local"
                value={draft.submittedAtBeforeExclusive}
              />
            </SimpleGrid>

            <Group gap="sm" justify="flex-end" wrap="wrap">
              <Button
                disabled={disabled || (!draftHasValues(draft) && !searchHasRestorableState(search))}
                leftSection={<IconEraser aria-hidden="true" size={17} />}
                mih={40}
                onClick={clear}
                type="button"
                variant="default"
              >
                {labels.clear}
              </Button>
              <Button
                disabled={disabled}
                leftSection={<IconFilter aria-hidden="true" size={17} />}
                mih={40}
                type="submit"
              >
                {labels.submit}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Paper>
  )
}