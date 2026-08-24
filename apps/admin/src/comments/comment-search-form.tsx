import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconEraser, IconSearch } from '@tabler/icons-react'
import { useEffect, useState, type FormEvent } from 'react'
import {
  commentListFilterDraftFromSearch,
  hasCommentListFilters,
  parseCommentListFilterDraft,
  type CommentListFilterDraft,
  type CommentListFilterError,
  type CommentListFilterField,
  type CommentListFilters,
  type CommentListSearch,
} from './comment-route-search'

export type CommentSearchFormLabels = {
  readonly title: string
  readonly description: string
  readonly formLabel: string
  readonly authorUserId: string
  readonly authorUserIdPlaceholder: string
  readonly chartId: string
  readonly chartIdPlaceholder: string
  readonly status: string
  readonly anyStatus: string
  readonly activeStatus: string
  readonly deletedStatus: string
  readonly createdAtFromInclusive: string
  readonly createdAtBeforeExclusive: string
  readonly localTimeDescription: string
  readonly clear: string
  readonly submit: string
  readonly validation: {
    readonly authorUserId: string
    readonly chartId: string
    readonly status: string
    readonly createdAtFromInclusive: string
    readonly createdAtBeforeExclusive: string
    readonly dateOrder: string
  }
}

export type CommentSearchFormProps = {
  readonly disabled?: boolean
  readonly labels: CommentSearchFormLabels
  readonly search: CommentListSearch
  readonly onClear: () => void
  readonly onSubmit: (filters: CommentListFilters) => void
}

const replaceDraftField = <TField extends CommentListFilterField>(
  draft: CommentListFilterDraft,
  field: TField,
  value: CommentListFilterDraft[TField],
): CommentListFilterDraft => ({ ...draft, [field]: value })

const draftHasValues = (draft: CommentListFilterDraft): boolean =>
  Object.values(draft).some((value) => value.length > 0)

const searchHasRestorableState = (search: CommentListSearch): boolean =>
  hasCommentListFilters(search) || Object.keys(search).some((key) => key !== 'sort')

export const CommentSearchForm = ({ disabled = false, labels, search, onClear, onSubmit }: CommentSearchFormProps) => {
  const [draft, setDraft] = useState(() => commentListFilterDraftFromSearch(search))
  const [errors, setErrors] = useState<Partial<Record<CommentListFilterField, CommentListFilterError>>>({})

  useEffect(() => {
    setDraft(commentListFilterDraftFromSearch(search))
    setErrors({})
  }, [
    search.authorUserId,
    search.chartId,
    search.createdAtBeforeExclusive,
    search.createdAtFromInclusive,
    search.status,
  ])

  const update = <TField extends CommentListFilterField>(field: TField, value: CommentListFilterDraft[TField]) => {
    setDraft((current) => replaceDraftField(current, field, value))
    setErrors((current) => {
      if (current[field] === undefined && !(field === 'createdAtFromInclusive' && current.createdAtBeforeExclusive)) {
        return current
      }
      const next = { ...current }
      delete next[field]
      if (field === 'createdAtFromInclusive' && next.createdAtBeforeExclusive === 'order') {
        delete next.createdAtBeforeExclusive
      }
      return next
    })
  }

  const validationMessage = (field: CommentListFilterField): string | undefined => {
    const error = errors[field]
    if (error === undefined) return undefined
    if (error === 'order') return labels.validation.dateOrder
    return labels.validation[field]
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = parseCommentListFilterDraft(draft)
    if (!parsed.success) {
      setErrors(parsed.errors)
      return
    }
    setDraft(commentListFilterDraftFromSearch(parsed.value))
    setErrors({})
    onSubmit(parsed.value)
  }

  const clear = () => {
    setDraft(commentListFilterDraftFromSearch({ sort: 'newest' }))
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
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                disabled={disabled}
                error={validationMessage('authorUserId')}
                label={labels.authorUserId}
                onChange={(event) => update('authorUserId', event.currentTarget.value)}
                placeholder={labels.authorUserIdPlaceholder}
                spellCheck={false}
                value={draft.authorUserId}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                disabled={disabled}
                error={validationMessage('chartId')}
                label={labels.chartId}
                onChange={(event) => update('chartId', event.currentTarget.value)}
                placeholder={labels.chartIdPlaceholder}
                spellCheck={false}
                value={draft.chartId}
              />
              <Select
                allowDeselect={false}
                data={[
                  { value: '', label: labels.anyStatus },
                  { value: 'active', label: labels.activeStatus },
                  { value: 'deleted', label: labels.deletedStatus },
                ]}
                disabled={disabled}
                error={validationMessage('status')}
                label={labels.status}
                onChange={(value) => update('status', (value ?? '') as CommentListFilterDraft['status'])}
                value={draft.status}
              />
              <TextInput
                autoComplete="off"
                description={labels.localTimeDescription}
                disabled={disabled}
                error={validationMessage('createdAtFromInclusive')}
                label={labels.createdAtFromInclusive}
                onChange={(event) => update('createdAtFromInclusive', event.currentTarget.value)}
                step={60}
                type="datetime-local"
                value={draft.createdAtFromInclusive}
              />
              <TextInput
                autoComplete="off"
                description={labels.localTimeDescription}
                disabled={disabled}
                error={validationMessage('createdAtBeforeExclusive')}
                label={labels.createdAtBeforeExclusive}
                onChange={(event) => update('createdAtBeforeExclusive', event.currentTarget.value)}
                step={60}
                type="datetime-local"
                value={draft.createdAtBeforeExclusive}
              />
            </SimpleGrid>

            <Group gap="sm" justify="flex-end" wrap="wrap">
              <Button
                disabled={disabled || (!draftHasValues(draft) && !searchHasRestorableState(search))}
                leftSection={<IconEraser aria-hidden="true" size={17} />}
                onClick={clear}
                type="button"
                variant="default"
              >
                {labels.clear}
              </Button>
              <Button disabled={disabled} leftSection={<IconSearch aria-hidden="true" size={17} />} type="submit">
                {labels.submit}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Paper>
  )
}