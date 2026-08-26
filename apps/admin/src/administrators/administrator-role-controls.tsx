import { ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH } from '@gekichumai/admin-contract'
import { Alert, Button, Code, Group, Modal, Paper, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { canManageAdministrators } from '../auth/admin-capabilities'
import { useAdminAuthActions, type AdminPrincipal } from '../auth/admin-auth-context'
import { useAdminRecentAuth } from '../auth/admin-recent-auth'
import { useAdminData } from '../data/admin-data-context'
import { normalizeAdminError, type AdminErrorKind } from '../data/admin-errors'
import { invalidateAfterAdministratorMutation } from '../data/invalidation'
import { validateAdministratorRoleChangeReason } from './administrator-role-form-model'

export type AdministratorRoleAction = 'grant' | 'revoke'
type VerificationStatus = 'cancelled' | 'complete' | 'required'

export type AdministratorRoleTarget = {
  readonly displayName: string
  readonly effectiveRole: 'admin' | 'super_admin' | 'user'
  readonly roleSource?: 'database' | 'deployment' | null
  readonly userId: string
}

export type AdministratorRoleControlsLabels = {
  readonly title: string
  readonly reasonLabel: string
  readonly reasonDescription: string
  readonly reasonRequired: string
  readonly reasonTooLong: string
  readonly grantAction: string
  readonly revokeAction: string
  readonly grantWarning: string
  readonly revokeWarning: string
  readonly targetUserLabel: string
  readonly confirmGrantTitle: string
  readonly confirmGrantDescription: string
  readonly confirmGrantAction: string
  readonly confirmRevokeTitle: string
  readonly confirmRevokeDescription: string
  readonly confirmRevokeAction: string
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
  readonly disabledCapability: string
  readonly disabledSelf: string
  readonly disabledDeployment: string
  readonly disabledSuperAdmin: string
  readonly invalidGrantTarget: string
  readonly invalidRevokeTarget: string
  readonly grantSuccessNotification: string
  readonly revokeSuccessNotification: string
}

export type AdministratorRoleControlsProps = {
  readonly labels: AdministratorRoleControlsLabels
  readonly onAuthoritativeMismatch?: (kind: 'conflict' | 'forbidden') => void
  readonly onSuccess?: (action: AdministratorRoleAction) => void
  readonly principal: AdminPrincipal
  readonly target: AdministratorRoleTarget
}

const roleActionForTarget = (target: AdministratorRoleTarget): AdministratorRoleAction | null => {
  if (target.effectiveRole === 'user' && target.roleSource == null) return 'grant'
  if (target.effectiveRole === 'admin' && target.roleSource === 'database') return 'revoke'
  return null
}

const disabledReasonForTarget = (
  principal: AdminPrincipal,
  target: AdministratorRoleTarget,
  action: AdministratorRoleAction | null,
  labels: AdministratorRoleControlsLabels,
): string | null => {
  if (!canManageAdministrators(principal)) return labels.disabledCapability
  if (principal.userId === target.userId) return labels.disabledSelf
  if (target.effectiveRole === 'super_admin') return labels.disabledSuperAdmin
  if (target.roleSource === 'deployment') return labels.disabledDeployment
  if (action === null && target.effectiveRole === 'user') return labels.invalidGrantTarget
  if (action === null) return labels.invalidRevokeTarget
  return null
}

const errorCopy = (kind: AdminErrorKind, labels: AdministratorRoleControlsLabels): string => {
  if (kind === 'conflict') return labels.conflictError
  if (kind === 'forbidden') return labels.forbiddenError
  return labels.genericError
}

export const AdministratorRoleControls = ({
  labels,
  onAuthoritativeMismatch,
  onSuccess,
  principal,
  target,
}: AdministratorRoleControlsProps) => {
  const data = useAdminData()
  const authActions = useAdminAuthActions()
  const recentAuth = useAdminRecentAuth()
  const queryClient = useQueryClient()
  const titleId = useId()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<AdministratorRoleAction | null>(null)
  const [pendingAction, setPendingAction] = useState<AdministratorRoleAction | null>(null)
  const [errorKind, setErrorKind] = useState<AdminErrorKind | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null)
  const [retryAction, setRetryAction] = useState<AdministratorRoleAction | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const subjectKey = JSON.stringify([target.userId, target.effectiveRole, target.roleSource ?? null])
  const subjectKeyRef = useRef(subjectKey)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    subjectKeyRef.current = subjectKey
    abortRef.current?.abort()
    abortRef.current = null
    inFlightRef.current = false
    setReason('')
    setReasonError(null)
    setConfirmation(null)
    setPendingAction(null)
    setErrorKind(null)
    setVerificationStatus(null)
    setRetryAction(null)
  }, [subjectKey])

  const action = roleActionForTarget(target)
  const disabledReason = disabledReasonForTarget(principal, target, action, labels)

  const validateReason = (): string | null => {
    const result = validateAdministratorRoleChangeReason(reason)
    if (result.ok) {
      setReasonError(null)
      return result.reason
    }
    setReasonError(result.issue === 'required' ? labels.reasonRequired : labels.reasonTooLong)
    return null
  }

  const refreshAuthoritativeState = async (subjectUserId = target.userId): Promise<void> => {
    await invalidateAfterAdministratorMutation(queryClient, subjectUserId)
  }

  const completeForcedVerification = async (
    retry: AdministratorRoleAction,
    expectedSubjectKey = subjectKey,
  ): Promise<void> => {
    setVerificationStatus('required')
    setRetryAction(retry)
    const verified = await recentAuth.requestRecentAuth({ force: true })
    if (!mountedRef.current || subjectKeyRef.current !== expectedSubjectKey) return
    setVerificationStatus(verified ? 'complete' : 'cancelled')
  }

  const handleFailure = async (
    caught: unknown,
    attemptedAction: AdministratorRoleAction,
    subjectUserId: string,
    expectedSubjectKey: string,
  ): Promise<void> => {
    const presentation = normalizeAdminError(caught)
    if (presentation.kind === 'cancelled') return

    if (presentation.kind === 'recent-auth-required') {
      setErrorKind(null)
      await completeForcedVerification(attemptedAction, expectedSubjectKey)
      return
    }

    if (presentation.kind === 'conflict' || presentation.kind === 'forbidden') {
      await refreshAuthoritativeState(subjectUserId)
    }
    authActions.reportFeatureError(caught)
    if (mountedRef.current && subjectKeyRef.current === expectedSubjectKey) {
      if ((presentation.kind === 'conflict' || presentation.kind === 'forbidden') && onAuthoritativeMismatch) {
        notifications.show({
          color: presentation.kind === 'conflict' ? 'orange' : 'red',
          message: errorCopy(presentation.kind, labels),
        })
        onAuthoritativeMismatch(presentation.kind)
        return
      }
      setErrorKind(presentation.kind)
      setRetryAction(attemptedAction)
    }
  }

  const performAction = async (attemptedAction: AdministratorRoleAction): Promise<void> => {
    if (
      inFlightRef.current ||
      disabledReason !== null ||
      errorKind === 'conflict' ||
      errorKind === 'forbidden' ||
      action === null ||
      attemptedAction !== action
    ) {
      return
    }

    const validatedReason = validateReason()
    if (validatedReason === null) {
      setConfirmation(null)
      return
    }

    const subjectUserId = target.userId
    const expectedSubjectKey = subjectKey
    inFlightRef.current = true
    setPendingAction(attemptedAction)
    setConfirmation(null)
    setErrorKind(null)
    setVerificationStatus(null)
    setRetryAction(null)

    try {
      const verified = await recentAuth.requestRecentAuth()
      if (!mountedRef.current || subjectKeyRef.current !== expectedSubjectKey) return
      if (!verified) {
        setVerificationStatus('cancelled')
        setRetryAction(attemptedAction)
        return
      }

      const abort = new AbortController()
      abortRef.current = abort
      const input = { body: { reason: validatedReason }, params: { userId: subjectUserId } }
      if (attemptedAction === 'grant') {
        await data.client.grantAdministrator(input, { signal: abort.signal })
      } else {
        await data.client.revokeAdministrator(input, { signal: abort.signal })
      }

      await refreshAuthoritativeState(subjectUserId)
      if (!mountedRef.current || subjectKeyRef.current !== expectedSubjectKey) return
      setReason('')
      setReasonError(null)
      notifications.show({
        color: 'green',
        message: attemptedAction === 'grant' ? labels.grantSuccessNotification : labels.revokeSuccessNotification,
      })
      onSuccess?.(attemptedAction)
    } catch (caught) {
      if (mountedRef.current && subjectKeyRef.current === expectedSubjectKey) {
        await handleFailure(caught, attemptedAction, subjectUserId, expectedSubjectKey)
      }
    } finally {
      if (subjectKeyRef.current === expectedSubjectKey) {
        abortRef.current = null
        inFlightRef.current = false
        if (mountedRef.current) setPendingAction(null)
      }
    }
  }

  const requestConfirmation = (requestedAction: AdministratorRoleAction): void => {
    if (
      disabledReason !== null ||
      errorKind === 'conflict' ||
      errorKind === 'forbidden' ||
      inFlightRef.current ||
      action === null ||
      requestedAction !== action ||
      validateReason() === null
    ) {
      return
    }
    setErrorKind(null)
    setVerificationStatus(null)
    setRetryAction(null)
    setConfirmation(requestedAction)
  }

  const reviewRetry = (): void => {
    if (retryAction === action) setConfirmation(retryAction)
  }

  const confirmationIsGrant = confirmation === 'grant'
  const warning = action === 'grant' ? labels.grantWarning : labels.revokeWarning
  const authoritativeMismatch = errorKind === 'conflict' || errorKind === 'forbidden'

  return (
    <Paper aria-labelledby={titleId} component="section" p="md" radius="md" withBorder>
      <Stack gap="md">
        <Text fw={700} id={titleId} size="lg">
          {labels.title}
        </Text>

        <Stack gap={4}>
          <Text c="dimmed" size="sm">
            {labels.targetUserLabel}
          </Text>
          <Text fw={600}>{target.displayName}</Text>
          <Code>{target.userId}</Code>
        </Stack>

        {disabledReason ? (
          <Alert color="gray" role="note">
            {disabledReason}
          </Alert>
        ) : null}

        {!canManageAdministrators(principal) || action === null ? null : (
          <>
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

            <Textarea
              description={labels.reasonDescription}
              disabled={disabledReason !== null || authoritativeMismatch}
              error={reasonError}
              label={labels.reasonLabel}
              maxLength={ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH + 1}
              minRows={3}
              onChange={(event) => {
                setReason(event.currentTarget.value)
                setReasonError(null)
              }}
              value={reason}
            />

            <Alert color={action === 'grant' ? 'blue' : 'orange'} role="note">
              {warning}
            </Alert>

            <Button
              color={action === 'revoke' ? 'red' : undefined}
              disabled={disabledReason !== null || authoritativeMismatch}
              loading={pendingAction === action}
              onClick={() => requestConfirmation(action)}
            >
              {action === 'grant' ? labels.grantAction : labels.revokeAction}
            </Button>

            <Modal
              centered
              closeButtonProps={{ 'aria-label': labels.cancelAction }}
              onClose={() => {
                if (pendingAction === null) setConfirmation(null)
              }}
              opened={confirmation !== null}
              title={confirmationIsGrant ? labels.confirmGrantTitle : labels.confirmRevokeTitle}
            >
              <Stack gap="md">
                <Text>{confirmationIsGrant ? labels.confirmGrantDescription : labels.confirmRevokeDescription}</Text>
                <Stack gap={4}>
                  <Text size="sm">{labels.targetUserLabel}</Text>
                  <Text fw={600}>{target.displayName}</Text>
                  <Code>{target.userId}</Code>
                </Stack>
                <Alert color={confirmationIsGrant ? 'blue' : 'orange'} role="note">
                  {confirmationIsGrant ? labels.grantWarning : labels.revokeWarning}
                </Alert>
                <Group justify="flex-end">
                  <Button disabled={pendingAction !== null} onClick={() => setConfirmation(null)} variant="default">
                    {labels.cancelAction}
                  </Button>
                  <Button
                    color={confirmationIsGrant ? undefined : 'red'}
                    loading={pendingAction === confirmation}
                    onClick={() => {
                      if (confirmation !== null) void performAction(confirmation)
                    }}
                  >
                    {confirmationIsGrant ? labels.confirmGrantAction : labels.confirmRevokeAction}
                  </Button>
                </Group>
              </Stack>
            </Modal>
          </>
        )}
      </Stack>
    </Paper>
  )
}