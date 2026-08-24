import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core'
import type { MessageKey } from '../i18n'
import { useAdminTranslation } from '../i18n'
import { normalizeAdminError, type AdminErrorKind } from '../data/admin-errors'

type ErrorCopy = {
  readonly description: MessageKey
  readonly title: MessageKey
}

const ERROR_COPY = {
  'client-incompatible': {
    description: 'error.clientIncompatible.description',
    title: 'error.clientIncompatible.title',
  },
  unauthenticated: {
    description: 'error.unauthenticated.description',
    title: 'error.unauthenticated.title',
  },
  forbidden: { description: 'error.forbidden.description', title: 'error.forbidden.title' },
  'recent-auth-required': {
    description: 'error.recentAuthRequired.description',
    title: 'error.recentAuthRequired.title',
  },
  'fresh-login-required': {
    description: 'error.freshLoginRequired.description',
    title: 'error.freshLoginRequired.title',
  },
  'step-up-failed': {
    description: 'error.stepUpFailed.description',
    title: 'error.stepUpFailed.title',
  },
  'step-up-rate-limited': {
    description: 'error.stepUpRateLimited.description',
    title: 'error.stepUpRateLimited.title',
  },
  validation: { description: 'error.validation.description', title: 'error.validation.title' },
  'not-found': { description: 'error.notFound.description', title: 'error.notFound.title' },
  conflict: { description: 'error.conflict.description', title: 'error.conflict.title' },
  'rate-limited': { description: 'error.rateLimited.description', title: 'error.rateLimited.title' },
  server: { description: 'error.server.description', title: 'error.server.title' },
  network: { description: 'error.network.description', title: 'error.network.title' },
  cancelled: { description: 'error.cancelled.description', title: 'error.cancelled.title' },
  unexpected: { description: 'error.unexpected.description', title: 'error.unexpected.title' },
} as const satisfies Readonly<Record<AdminErrorKind, ErrorCopy>>

const ERROR_COLOR = {
  'client-incompatible': 'red',
  unauthenticated: 'red',
  forbidden: 'red',
  'recent-auth-required': 'blue',
  'fresh-login-required': 'red',
  'step-up-failed': 'orange',
  'step-up-rate-limited': 'yellow',
  validation: 'yellow',
  'not-found': 'blue',
  conflict: 'orange',
  'rate-limited': 'yellow',
  server: 'red',
  network: 'orange',
  cancelled: 'gray',
  unexpected: 'red',
} as const satisfies Readonly<Record<AdminErrorKind, string>>

export type AdminErrorNoticeProps = {
  readonly error: unknown
  readonly onRefresh?: () => void
  readonly onRetry?: () => void
  readonly onStepUp?: () => void
}

export const AdminErrorNotice = ({ error, onRefresh, onRetry, onStepUp }: AdminErrorNoticeProps) => {
  const { t } = useAdminTranslation()
  const presentation = normalizeAdminError(error)
  if (presentation.kind === 'cancelled') return null

  const copy = ERROR_COPY[presentation.kind]
  const signInRequired = presentation.kind === 'unauthenticated' || presentation.kind === 'fresh-login-required'
  const stepUpRequired = presentation.kind === 'recent-auth-required' || presentation.kind === 'step-up-failed'
  const refreshRequired = presentation.kind === 'conflict' || presentation.kind === 'not-found'
  const retryAllowed =
    presentation.kind === 'network' || presentation.kind === 'server' || presentation.kind === 'unexpected'

  return (
    <Alert color={ERROR_COLOR[presentation.kind]} role="alert" title={t(copy.title)} variant="light">
      <Stack gap="sm">
        <Text size="sm">{t(copy.description)}</Text>
        {presentation.requestId ? (
          <Text size="sm">
            <Text component="span" fw={600}>
              {t('error.supportId')}:
            </Text>{' '}
            <Code style={{ fontVariantNumeric: 'tabular-nums' }}>{presentation.requestId}</Code>
          </Text>
        ) : null}
        <Group gap="sm" wrap="wrap">
          {signInRequired ? (
            <Button component="a" href="/sign-in" mih={40} size="sm" variant="default">
              {t('actions.signInAgain')}
            </Button>
          ) : null}
          {stepUpRequired && onStepUp ? (
            <Button mih={40} onClick={onStepUp} size="sm" variant="default">
              {t('actions.verifyIdentity')}
            </Button>
          ) : null}
          {refreshRequired && onRefresh ? (
            <Button mih={40} onClick={onRefresh} size="sm" variant="default">
              {t('actions.refreshCurrentState')}
            </Button>
          ) : null}
          {retryAllowed && onRetry ? (
            <Button mih={40} onClick={onRetry} size="sm" variant="default">
              {t('actions.retry')}
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Alert>
  )
}