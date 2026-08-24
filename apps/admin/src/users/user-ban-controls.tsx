import { ADMIN_USER_BAN_REASON_MAX_LENGTH, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { Alert, Button, Code, Group, Modal, Paper, Radio, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { canModerateUser } from '../auth/admin-capabilities'
import { useAdminAuthActions, type AdminPrincipal } from '../auth/admin-auth-context'
import { useAdminRecentAuth } from '../auth/admin-recent-auth'
import { useAdminData } from '../data/admin-data-context'
import { normalizeAdminError, type AdminErrorKind } from '../data/admin-errors'
import { invalidateAfterUserModeration } from '../data/invalidation'
import { validateTemporaryBanExpiry, validateUserBanReason } from './user-ban-form-model'

type UserModerationDetail = AdminContractOutputs['getUserModerationDetail']
type BanKind = 'permanent' | 'temporary'
type ModerationAction = 'ban' | 'unban'
type VerificationStatus = 'cancelled' | 'complete' | 'required'

type FieldErrors = {
  readonly expiresAt?: string
  readonly reason?: string
}

export type UserBanControlsLabels = {
  readonly title: string
  readonly permanentOption: string
  readonly temporaryOption: string
  readonly reasonLabel: string
  readonly reasonDisclosure: string
  readonly reasonRequired: string
  readonly reasonTooLong: string
  readonly temporaryExpiryLabel: string
  readonly temporaryExpiryDescription: string
  readonly localTimeLabel: string
  readonly utcTimeLabel: string
  readonly temporaryExpiryRequired: string
  readonly temporaryExpiryInvalid: string
  readonly temporaryExpiryNotFuture: string
  readonly temporaryExpiryTooFar: string
  readonly sessionRevocationWarning: string
  readonly contentRetentionWarning: string
  readonly banAction: string
  readonly unbanAction: string
  readonly confirmBanTitle: string
  readonly confirmBanDescription: string
  readonly confirmBanAction: string
  readonly confirmUnbanTitle: string
  readonly confirmUnbanDescription: string
  readonly confirmUnbanAction: string
  readonly cancelAction: string
  readonly verificationRequired: string
  readonly verificationCancelled: string
  readonly verificationCompleteRetry: string
  readonly verifyIdentityAction: string
  readonly retryAction: string
  readonly conflictError: string
  readonly forbiddenError: string
  readonly genericError: string
  readonly refreshAction: string
  readonly disabledSelf: string
  readonly disabledHierarchy: string
  readonly disabledSuperAdmin: string
  readonly disabledCapability: string
  readonly banSuccessNotification: string
  readonly unbanSuccessNotification: string
}

export type UserBanControlsProps = {
  readonly labels: UserBanControlsLabels
  readonly now?: () => Date
  readonly principal: AdminPrincipal
  readonly user: UserModerationDetail
}

const defaultNow = () => new Date()

const reasonErrorCopy = (issue: 'required' | 'too-long', labels: UserBanControlsLabels) =>
  issue === 'required' ? labels.reasonRequired : labels.reasonTooLong

const expiryErrorCopy = (issue: 'invalid' | 'not-future' | 'required' | 'too-far', labels: UserBanControlsLabels) => {
  if (issue === 'required') return labels.temporaryExpiryRequired
  if (issue === 'invalid') return labels.temporaryExpiryInvalid
  if (issue === 'not-future') return labels.temporaryExpiryNotFuture
  return labels.temporaryExpiryTooFar
}

const moderationDisabledReason = (
  principal: AdminPrincipal,
  user: UserModerationDetail,
  labels: UserBanControlsLabels,
): string | null => {
  if (principal.userId === user.userId) return labels.disabledSelf
  if (user.effectiveRole === 'super_admin') return labels.disabledSuperAdmin
  if (user.effectiveRole === 'admin' && !canModerateUser(principal, user.effectiveRole)) {
    return labels.disabledHierarchy
  }
  if (!canModerateUser(principal, user.effectiveRole)) return labels.disabledCapability
  return null
}

const errorCopy = (kind: AdminErrorKind, labels: UserBanControlsLabels) => {
  if (kind === 'conflict') return labels.conflictError
  if (kind === 'forbidden') return labels.forbiddenError
  return labels.genericError
}

export const UserBanControls = ({ labels, now = defaultNow, principal, user }: UserBanControlsProps) => {
  const data = useAdminData()
  const authActions = useAdminAuthActions()
  const recentAuth = useAdminRecentAuth()
  const queryClient = useQueryClient()
  const titleId = useId()
  const [kind, setKind] = useState<BanKind>('temporary')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [confirmation, setConfirmation] = useState<ModerationAction | null>(null)
  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(null)
  const [errorKind, setErrorKind] = useState<AdminErrorKind | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null)
  const [retryAction, setRetryAction] = useState<ModerationAction | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const subjectUserIdRef = useRef(user.userId)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    subjectUserIdRef.current = user.userId
    abortRef.current?.abort()
    abortRef.current = null
    inFlightRef.current = false
    setKind('temporary')
    setReason('')
    setExpiresAt('')
    setFieldErrors({})
    setConfirmation(null)
    setPendingAction(null)
    setErrorKind(null)
    setVerificationStatus(null)
    setRetryAction(null)
  }, [user.userId])

  const disabledReason = moderationDisabledReason(principal, user, labels)
  const activeBan = user.banState.status === 'permanent' || user.banState.status === 'temporary'

  const validateBanFields = () => {
    const validatedReason = validateUserBanReason(reason)
    const validatedExpiry = kind === 'temporary' ? validateTemporaryBanExpiry(expiresAt, now()) : null
    const errors: FieldErrors = {
      reason: validatedReason.ok ? undefined : reasonErrorCopy(validatedReason.issue, labels),
      expiresAt:
        validatedExpiry === null || validatedExpiry.ok ? undefined : expiryErrorCopy(validatedExpiry.issue, labels),
    }
    setFieldErrors(errors)
    if (!validatedReason.ok || (validatedExpiry !== null && !validatedExpiry.ok)) return null

    return kind === 'temporary'
      ? {
          expectedStateVersion: user.banState.stateVersion,
          expiresAt: validatedExpiry!.expiresAt,
          kind,
          reason: validatedReason.reason,
        }
      : {
          expectedStateVersion: user.banState.stateVersion,
          kind,
          reason: validatedReason.reason,
        }
  }

  const refreshAuthoritativeState = async (subjectUserId = user.userId) => {
    await invalidateAfterUserModeration(queryClient, subjectUserId)
  }

  const completeForcedVerification = async (action: ModerationAction, subjectUserId = user.userId) => {
    setVerificationStatus('required')
    setRetryAction(action)
    const verified = await recentAuth.requestRecentAuth({ force: true })
    if (!mountedRef.current || subjectUserIdRef.current !== subjectUserId) return
    setVerificationStatus(verified ? 'complete' : 'cancelled')
  }

  const handleFailure = async (caught: unknown, action: ModerationAction, subjectUserId: string) => {
    const presentation = normalizeAdminError(caught)
    if (presentation.kind === 'cancelled') return

    if (presentation.kind === 'recent-auth-required') {
      setErrorKind(null)
      await completeForcedVerification(action, subjectUserId)
      return
    }

    if (presentation.kind === 'conflict' || presentation.kind === 'forbidden') {
      await refreshAuthoritativeState(subjectUserId)
    }
    authActions.reportFeatureError(caught)
    if (mountedRef.current && subjectUserIdRef.current === subjectUserId) {
      setErrorKind(presentation.kind)
      setRetryAction(action)
    }
  }

  const performAction = async (action: ModerationAction) => {
    if (inFlightRef.current || disabledReason !== null) return
    const subjectUserId = user.userId

    const banBody = action === 'ban' ? validateBanFields() : null
    if (action === 'ban' && banBody === null) {
      setConfirmation(null)
      return
    }

    inFlightRef.current = true
    setPendingAction(action)
    setConfirmation(null)
    setErrorKind(null)
    setVerificationStatus(null)
    setRetryAction(null)

    try {
      const verified = await recentAuth.requestRecentAuth()
      if (!mountedRef.current || subjectUserIdRef.current !== subjectUserId) return
      if (!verified) {
        setVerificationStatus('cancelled')
        setRetryAction(action)
        return
      }

      const abort = new AbortController()
      abortRef.current = abort
      if (action === 'ban') {
        await data.client.banUser({ body: banBody!, params: { userId: subjectUserId } }, { signal: abort.signal })
      } else {
        await data.client.unbanUser(
          {
            body: { expectedStateVersion: user.banState.stateVersion },
            params: { userId: subjectUserId },
          },
          { signal: abort.signal },
        )
      }

      await refreshAuthoritativeState(subjectUserId)
      if (!mountedRef.current || subjectUserIdRef.current !== subjectUserId) return
      setReason('')
      setExpiresAt('')
      setFieldErrors({})
      notifications.show({
        color: 'green',
        message: action === 'ban' ? labels.banSuccessNotification : labels.unbanSuccessNotification,
      })
    } catch (caught) {
      if (mountedRef.current && subjectUserIdRef.current === subjectUserId) {
        await handleFailure(caught, action, subjectUserId)
      }
    } finally {
      if (subjectUserIdRef.current === subjectUserId) {
        abortRef.current = null
        inFlightRef.current = false
        if (mountedRef.current) setPendingAction(null)
      }
    }
  }

  const requestConfirmation = (action: ModerationAction) => {
    if (disabledReason !== null || inFlightRef.current) return
    if (action === 'ban' && validateBanFields() === null) return
    setErrorKind(null)
    setVerificationStatus(null)
    setRetryAction(null)
    setConfirmation(action)
  }

  const reviewRetry = () => {
    if (retryAction !== null) setConfirmation(retryAction)
  }

  const confirmationIsBan = confirmation === 'ban'
  const confirmationExpiry =
    confirmationIsBan && kind === 'temporary' ? validateTemporaryBanExpiry(expiresAt, now()) : null

  return (
    <Paper aria-labelledby={titleId} component="section" p="md" radius="md" withBorder>
      <Stack gap="md">
        <Text fw={700} id={titleId} size="lg">
          {labels.title}
        </Text>

        {disabledReason ? (
          <Alert color="gray" role="note">
            {disabledReason}
          </Alert>
        ) : null}

        {verificationStatus ? (
          <Alert color={verificationStatus === 'complete' ? 'green' : 'blue'} component="output">
            <Stack gap="sm">
              <Text size="sm">
                {verificationStatus === 'required'
                  ? labels.verificationRequired
                  : verificationStatus === 'cancelled'
                    ? labels.verificationCancelled
                    : labels.verificationCompleteRetry}
              </Text>
              <Group gap="sm">
                {verificationStatus === 'cancelled' && retryAction ? (
                  <Button
                    disabled={pendingAction !== null}
                    onClick={() => void completeForcedVerification(retryAction)}
                    variant="default"
                  >
                    {labels.verifyIdentityAction}
                  </Button>
                ) : null}
                {verificationStatus === 'complete' && retryAction ? (
                  <Button disabled={pendingAction !== null} onClick={reviewRetry} variant="default">
                    {labels.retryAction}
                  </Button>
                ) : null}
              </Group>
            </Stack>
          </Alert>
        ) : null}

        {errorKind && errorKind !== 'recent-auth-required' ? (
          <Alert color="red" role="alert">
            <Stack gap="sm">
              <Text size="sm">{errorCopy(errorKind, labels)}</Text>
              {errorKind === 'conflict' || errorKind === 'forbidden' ? (
                <Button onClick={() => void refreshAuthoritativeState()} variant="default">
                  {labels.refreshAction}
                </Button>
              ) : retryAction ? (
                <Button onClick={reviewRetry} variant="default">
                  {labels.retryAction}
                </Button>
              ) : null}
            </Stack>
          </Alert>
        ) : null}

        {activeBan ? (
          <Stack gap="sm">
            <Text fw={600} size="sm">
              {user.banState.status === 'permanent' ? labels.permanentOption : labels.temporaryOption}
            </Text>
            {user.banState.status === 'temporary' ? (
              <Text size="sm">
                {labels.temporaryExpiryLabel}: <time dateTime={user.banState.expiresAt}>{user.banState.expiresAt}</time>
              </Text>
            ) : null}
            <Button
              color="red"
              disabled={disabledReason !== null}
              loading={pendingAction === 'unban'}
              onClick={() => requestConfirmation('unban')}
              variant="outline"
            >
              {labels.unbanAction}
            </Button>
          </Stack>
        ) : (
          <Stack gap="md">
            <Radio.Group
              aria-label={labels.title}
              onChange={(value) => {
                setKind(value as BanKind)
                setFieldErrors((current) => ({ ...current, expiresAt: undefined }))
              }}
              value={kind}
            >
              <Group mt="xs">
                <Radio disabled={disabledReason !== null} label={labels.temporaryOption} value="temporary" />
                <Radio disabled={disabledReason !== null} label={labels.permanentOption} value="permanent" />
              </Group>
            </Radio.Group>

            {kind === 'temporary' ? (
              <TextInput
                description={labels.temporaryExpiryDescription}
                disabled={disabledReason !== null}
                error={fieldErrors.expiresAt}
                label={labels.temporaryExpiryLabel}
                onChange={(event) => {
                  setExpiresAt(event.currentTarget.value)
                  setFieldErrors((current) => ({ ...current, expiresAt: undefined }))
                }}
                type="datetime-local"
                value={expiresAt}
              />
            ) : null}

            <Textarea
              description={labels.reasonDisclosure}
              disabled={disabledReason !== null}
              error={fieldErrors.reason}
              label={labels.reasonLabel}
              maxLength={ADMIN_USER_BAN_REASON_MAX_LENGTH + 1}
              minRows={3}
              onChange={(event) => {
                setReason(event.currentTarget.value)
                setFieldErrors((current) => ({ ...current, reason: undefined }))
              }}
              value={reason}
            />

            <Alert color="orange" role="note">
              {labels.sessionRevocationWarning}
            </Alert>
            <Alert color="blue" role="note">
              {labels.contentRetentionWarning}
            </Alert>

            <Button
              color="red"
              disabled={disabledReason !== null}
              loading={pendingAction === 'ban'}
              onClick={() => requestConfirmation('ban')}
            >
              {labels.banAction}
            </Button>
          </Stack>
        )}

        <Modal
          centered
          closeButtonProps={{ 'aria-label': labels.cancelAction }}
          onClose={() => {
            if (pendingAction === null) setConfirmation(null)
          }}
          opened={confirmation !== null}
          title={confirmationIsBan ? labels.confirmBanTitle : labels.confirmUnbanTitle}
        >
          <Stack gap="md">
            <Text>{confirmationIsBan ? labels.confirmBanDescription : labels.confirmUnbanDescription}</Text>
            <Stack gap={4}>
              <Text fw={600}>{user.displayName}</Text>
              <Code>{user.userId}</Code>
              {confirmationIsBan ? (
                <>
                  <Text>{kind === 'permanent' ? labels.permanentOption : labels.temporaryOption}</Text>
                  {kind === 'temporary' ? (
                    <Stack gap={2}>
                      <Text size="sm">
                        {labels.localTimeLabel}: <time>{expiresAt}</time>
                      </Text>
                      {confirmationExpiry?.ok ? (
                        <Text size="sm">
                          {labels.utcTimeLabel}:{' '}
                          <Code>
                            <time dateTime={confirmationExpiry.expiresAt}>{confirmationExpiry.expiresAt}</time>
                          </Code>
                        </Text>
                      ) : null}
                    </Stack>
                  ) : null}
                </>
              ) : null}
            </Stack>
            {confirmationIsBan ? (
              <Stack gap="xs">
                <Alert color="blue" role="note">
                  {labels.reasonDisclosure}
                </Alert>
                <Alert color="orange" role="note">
                  {labels.sessionRevocationWarning}
                </Alert>
                <Alert color="blue" role="note">
                  {labels.contentRetentionWarning}
                </Alert>
              </Stack>
            ) : null}
            <Group justify="flex-end">
              <Button disabled={pendingAction !== null} onClick={() => setConfirmation(null)} variant="default">
                {labels.cancelAction}
              </Button>
              <Button
                color="red"
                loading={pendingAction === confirmation}
                onClick={() => {
                  if (confirmation !== null) void performAction(confirmation)
                }}
              >
                {confirmationIsBan ? labels.confirmBanAction : labels.confirmUnbanAction}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Paper>
  )
}