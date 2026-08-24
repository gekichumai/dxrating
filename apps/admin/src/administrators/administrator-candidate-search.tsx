import {
  AdminUserDisplayNamePrefixSchema,
  AdminUserIdSchema,
  AdminUserSearchEmailSchema,
} from '@gekichumai/admin-contract'
import {
  Alert,
  Button,
  Code,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconCheck, IconInfoCircle, IconSearch, IconX } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { AdminErrorNotice } from '../components/admin-error-notice'
import type { AdminClient } from '../data/admin-client'
import { useAdminData } from '../data/admin-data-context'
import { userSearchQueryOptions, type UserSearchQueryParameters } from '../data/query-options'
import classes from './administrator-candidate-search.module.css'

export type AdministratorCandidate = Awaited<ReturnType<AdminClient['searchUsers']>>['items'][number]

type CandidateSearchKind = 'userId' | 'email' | 'displayName'
type CandidateSearch = Pick<UserSearchQueryParameters, CandidateSearchKind>
type SubmittedCandidateSearch = {
  readonly revision: number
  readonly search: CandidateSearch
}

export type AdministratorCandidateSearchLabels = {
  readonly title: string
  readonly description: string
  readonly existingAccountsOnly: string
  readonly formLabel: string
  readonly searchBy: string
  readonly searchByUserId: string
  readonly searchByEmail: string
  readonly searchByDisplayName: string
  readonly query: string
  readonly userIdPlaceholder: string
  readonly emailPlaceholder: string
  readonly displayNamePlaceholder: string
  readonly required: string
  readonly invalidUserId: string
  readonly invalidEmail: string
  readonly invalidDisplayName: string
  readonly submit: string
  readonly loading: string
  readonly empty: string
  readonly resultsCaption: string
  readonly tableRegion: string
  readonly identity: string
  readonly email: string
  readonly verification: string
  readonly verified: string
  readonly notVerified: string
  readonly select: string
  readonly selected: string
  readonly backToNewest: string
  readonly older: string
}

export type AdministratorCandidateSearchProps = {
  readonly disabled?: boolean
  readonly labels: AdministratorCandidateSearchLabels
  readonly limit?: number
  readonly onSelect: (candidate: AdministratorCandidate) => void
  readonly onSelectionInvalidated?: () => void
  readonly selectedUserId?: string
}

const SEARCH_SCHEMAS = {
  userId: AdminUserIdSchema,
  email: AdminUserSearchEmailSchema,
  displayName: AdminUserDisplayNamePrefixSchema,
} as const

const inputPlaceholder = (kind: CandidateSearchKind, labels: AdministratorCandidateSearchLabels): string =>
  kind === 'userId'
    ? labels.userIdPlaceholder
    : kind === 'email'
      ? labels.emailPlaceholder
      : labels.displayNamePlaceholder

const invalidInputLabel = (kind: CandidateSearchKind, labels: AdministratorCandidateSearchLabels): string =>
  kind === 'userId' ? labels.invalidUserId : kind === 'email' ? labels.invalidEmail : labels.invalidDisplayName

const CandidateResults = ({
  disabled,
  labels,
  limit,
  onSelect,
  onSelectionInvalidated,
  search,
  selectedUserId,
}: {
  readonly disabled: boolean
  readonly labels: AdministratorCandidateSearchLabels
  readonly limit?: number
  readonly onSelect: (candidate: AdministratorCandidate) => void
  readonly onSelectionInvalidated?: () => void
  readonly search: CandidateSearch
  readonly selectedUserId?: string
}) => {
  const data = useAdminData()
  const [cursor, setCursor] = useState<string>()
  const parameters: UserSearchQueryParameters = {
    ...search,
    effectiveRole: 'user',
    activeBan: false,
    ...(cursor ? { cursor } : {}),
    ...(limit === undefined ? {} : { limit }),
  }
  const query = useQuery(userSearchQueryOptions(data, parameters))

  useEffect(() => {
    if (!selectedUserId || !query.data || query.isFetching) return
    if (!query.data.items.some((candidate) => candidate.userId === selectedUserId)) onSelectionInvalidated?.()
  }, [onSelectionInvalidated, query.data, query.isFetching, selectedUserId])

  if (query.isPending) {
    return (
      <Stack aria-live="polite" component="output" gap="sm">
        <Text size="sm">{labels.loading}</Text>
        <Skeleton height={42} radius="sm" />
        <Skeleton height={42} radius="sm" />
      </Stack>
    )
  }

  if (query.error) {
    return (
      <AdminErrorNotice
        error={query.error}
        onRefresh={() => (cursor ? setCursor(undefined) : void query.refetch())}
        onRetry={() => void query.refetch()}
      />
    )
  }

  if (!query.data) return null

  return (
    <Stack gap="md">
      {query.data.items.length === 0 ? (
        <Text c="dimmed" size="sm">
          {labels.empty}
        </Text>
      ) : (
        <Table.ScrollContainer
          aria-label={labels.tableRegion}
          component="section"
          minWidth={768}
          tabIndex={0}
          type="native"
        >
          <Table className={classes.table} highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
            <Table.Caption>{labels.resultsCaption}</Table.Caption>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{labels.identity}</Table.Th>
                <Table.Th>{labels.email}</Table.Th>
                <Table.Th>{labels.verification}</Table.Th>
                <Table.Th>{labels.select}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {query.data.items.map((candidate) => {
                const selected = selectedUserId === candidate.userId
                return (
                  <Table.Tr key={candidate.userId}>
                    <Table.Td>
                      <Stack gap={3}>
                        <Text fw={650}>{candidate.displayName}</Text>
                        <Code className={classes.identifier}>{candidate.userId}</Code>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{candidate.email}</Table.Td>
                    <Table.Td>
                      <span className={classes.verification}>
                        {candidate.emailVerified ? (
                          <IconCheck aria-hidden="true" color="var(--mantine-color-teal-6)" size={16} />
                        ) : (
                          <IconX aria-hidden="true" color="var(--mantine-color-gray-6)" size={16} />
                        )}
                        <Text c="dimmed" component="span" size="sm">
                          {candidate.emailVerified ? labels.verified : labels.notVerified}
                        </Text>
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        aria-label={`${selected ? labels.selected : labels.select}: ${candidate.displayName} (${candidate.userId})`}
                        aria-pressed={selected}
                        disabled={disabled || selected}
                        onClick={() => onSelect(candidate)}
                        size="xs"
                        variant={selected ? 'light' : 'default'}
                      >
                        {selected ? labels.selected : labels.select}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {cursor || query.data.nextCursor ? (
        <Group gap="sm" justify="flex-end" wrap="wrap">
          {cursor ? (
            <Button disabled={disabled} onClick={() => setCursor(undefined)} variant="default">
              {labels.backToNewest}
            </Button>
          ) : null}
          {query.data.nextCursor ? (
            <Button disabled={disabled} onClick={() => setCursor(query.data.nextCursor ?? undefined)} variant="default">
              {labels.older}
            </Button>
          ) : null}
        </Group>
      ) : null}
    </Stack>
  )
}

export const AdministratorCandidateSearch = ({
  disabled = false,
  labels,
  limit,
  onSelect,
  onSelectionInvalidated,
  selectedUserId,
}: AdministratorCandidateSearchProps) => {
  const titleId = useId()
  const [kind, setKind] = useState<CandidateSearchKind>('userId')
  const [value, setValue] = useState('')
  const [error, setError] = useState<'required' | 'invalid'>()
  const [submittedSearch, setSubmittedSearch] = useState<SubmittedCandidateSearch>()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (value.trim().length === 0) {
      setError('required')
      return
    }
    const parsed = SEARCH_SCHEMAS[kind].safeParse(value)
    if (!parsed.success) {
      setError('invalid')
      return
    }
    setValue(parsed.data)
    setError(undefined)
    onSelectionInvalidated?.()
    setSubmittedSearch((current) => ({
      revision: (current?.revision ?? 0) + 1,
      search: { [kind]: parsed.data },
    }))
  }

  const changeKind = (nextKind: string | null) => {
    if (nextKind !== 'userId' && nextKind !== 'email' && nextKind !== 'displayName') return
    setKind(nextKind)
    setError(undefined)
  }

  return (
    <Paper aria-labelledby={titleId} component="section" p="lg" radius="lg" shadow="xs" withBorder>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title id={titleId} order={2} size="h3">
            {labels.title}
          </Title>
          <Text c="dimmed" size="sm">
            {labels.description}
          </Text>
        </Stack>

        <Alert color="blue" icon={<IconInfoCircle aria-hidden="true" size={18} />} role="note" variant="light">
          {labels.existingAccountsOnly}
        </Alert>

        <form aria-label={labels.formLabel} noValidate onSubmit={submit}>
          <SimpleGrid className={classes.formGrid} cols={{ base: 1, sm: 2 }} spacing="md">
            <Select
              allowDeselect={false}
              data={[
                { value: 'userId', label: labels.searchByUserId },
                { value: 'email', label: labels.searchByEmail },
                { value: 'displayName', label: labels.searchByDisplayName },
              ]}
              disabled={disabled}
              label={labels.searchBy}
              onChange={changeKind}
              value={kind}
            />
            <TextInput
              autoCapitalize={kind === 'displayName' ? 'sentences' : 'none'}
              autoComplete="off"
              disabled={disabled}
              error={
                error === 'required' ? labels.required : error === 'invalid' ? invalidInputLabel(kind, labels) : null
              }
              label={labels.query}
              onChange={(event) => {
                setValue(event.currentTarget.value)
                setError(undefined)
              }}
              placeholder={inputPlaceholder(kind, labels)}
              spellCheck={kind === 'displayName'}
              type={kind === 'email' ? 'email' : 'text'}
              value={value}
            />
          </SimpleGrid>
          <Group justify="flex-end" mt="md">
            <Button disabled={disabled} leftSection={<IconSearch aria-hidden="true" size={17} />} type="submit">
              {labels.submit}
            </Button>
          </Group>
        </form>

        {submittedSearch ? (
          <CandidateResults
            disabled={disabled}
            key={submittedSearch.revision}
            labels={labels}
            limit={limit}
            onSelect={onSelect}
            onSelectionInvalidated={onSelectionInvalidated}
            search={submittedSearch.search}
            selectedUserId={selectedUserId}
          />
        ) : null}
      </Stack>
    </Paper>
  )
}