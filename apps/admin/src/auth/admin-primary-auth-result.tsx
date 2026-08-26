import { Alert, Button, Center, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { useAdminData } from '../data/admin-data-context'
import { adminPrimaryAuthStatusQueryOptions } from '../data/query-options'
import { isAdminRecentAuthValid } from './admin-recent-auth'

export type AdminPrimaryAuthResultHint = 'failure' | 'success'

export const readAdminPrimaryAuthResultHint = (search: string): AdminPrimaryAuthResultHint =>
  new URLSearchParams(search).get('status') === 'success' ? 'success' : 'failure'

export const stripAdminPrimaryAuthResultQuery = ({
  hash,
  history,
  pathname,
}: {
  readonly hash: string
  readonly history: Pick<History, 'replaceState' | 'state'>
  readonly pathname: string
}) => history.replaceState(history.state, '', `${pathname}${hash}`)

export type AdminPrimaryAuthResultLabels = {
  readonly checkingDescription: string
  readonly checkingTitle: string
  readonly continue: string
  readonly failureDescription: string
  readonly failureTitle: string
  readonly retry: string
  readonly successDescription: string
  readonly successTitle: string
}

export type AdminPrimaryAuthResultProps = {
  readonly labels: AdminPrimaryAuthResultLabels
  readonly now?: () => number
  readonly onContinue: () => void
  readonly search?: string
  readonly stripQuery?: () => void
}

type ResultState =
  | { readonly status: 'checking' }
  | { readonly status: 'failure'; readonly error?: unknown }
  | { readonly status: 'success' }

const defaultStripQuery = () =>
  stripAdminPrimaryAuthResultQuery({
    hash: globalThis.location.hash,
    history: globalThis.history,
    pathname: globalThis.location.pathname,
  })

export const AdminPrimaryAuthResult = ({
  labels,
  now = Date.now,
  onContinue,
  search = globalThis.location.search,
  stripQuery = defaultStripQuery,
}: AdminPrimaryAuthResultProps) => {
  const data = useAdminData()
  const queryClient = useQueryClient()
  const hint = useRef(readAdminPrimaryAuthResultHint(search))
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [result, setResult] = useState<ResultState>({ status: 'checking' })

  useLayoutEffect(stripQuery, [stripQuery])

  const verifyStatus = useCallback(async () => {
    setResult({ status: 'checking' })
    try {
      const status = await queryClient.fetchQuery({
        ...adminPrimaryAuthStatusQueryOptions(data),
        staleTime: 0,
      })
      const observedAt =
        queryClient.getQueryState(adminPrimaryAuthStatusQueryOptions(data).queryKey)?.dataUpdatedAt ?? 0
      setResult(isAdminRecentAuthValid({ observedAt, status }, now()) ? { status: 'success' } : { status: 'failure' })
    } catch (error) {
      setResult({ status: 'failure', error })
    }
  }, [data, now, queryClient])

  useEffect(() => {
    if (hint.current === 'success') void verifyStatus()
    else setResult({ status: 'failure' })
  }, [verifyStatus])

  useEffect(() => {
    if (result.status !== 'checking') headingRef.current?.focus()
  }, [result.status])

  const copy =
    result.status === 'checking'
      ? { title: labels.checkingTitle, description: labels.checkingDescription }
      : result.status === 'success'
        ? { title: labels.successTitle, description: labels.successDescription }
        : {
            title: labels.failureTitle,
            description: labels.failureDescription,
          }

  return (
    <Center component="main" mih="100dvh" p="md">
      <Paper maw={560} p="xl" radius="lg" shadow="sm" w="100%">
        <Stack align="flex-start" gap="md">
          <Title order={1} ref={headingRef} tabIndex={-1}>
            {copy.title}
          </Title>
          {result.status === 'checking' ? (
            <Group component="output" gap="sm">
              <Loader aria-hidden="true" size="sm" />
              <Text>{copy.description}</Text>
            </Group>
          ) : result.status === 'success' ? (
            <Alert color="green" icon={<IconCircleCheck aria-hidden="true" size={18} />} title={copy.title}>
              {copy.description}
            </Alert>
          ) : (
            <Stack gap="md" w="100%">
              {result.error ? (
                <AdminErrorNotice error={result.error} onRetry={() => void verifyStatus()} />
              ) : (
                <Alert
                  color="orange"
                  icon={<IconAlertTriangle aria-hidden="true" size={18} />}
                  role="alert"
                  title={copy.title}
                >
                  {copy.description}
                </Alert>
              )}
              {!result.error ? <Button onClick={() => void verifyStatus()}>{labels.retry}</Button> : null}
            </Stack>
          )}
          <Button
            disabled={result.status === 'checking'}
            onClick={onContinue}
            variant={result.status === 'success' ? 'filled' : 'default'}
          >
            {labels.continue}
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}