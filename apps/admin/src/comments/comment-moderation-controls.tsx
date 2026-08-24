import { ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { Alert, Button, Code, Group, Modal, Paper, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { canModerateUser } from '../auth/admin-capabilities'
import { useAdminAuthActions, type AdminPrincipal } from '../auth/admin-auth-context'
import { useAdminRecentAuth } from '../auth/admin-recent-auth'
import { useAdminData } from '../data/admin-data-context'
import { normalizeAdminError, type AdminErrorKind } from '../data/admin-errors'
import { invalidateAfterCommentMutation } from '../data/invalidation'
import { adminQueryKeys } from '../data/query-keys'
import { validateCommentModerationReason } from './comment-moderation-form-model'

type CommentModerationDetail = AdminContractOutputs['getCommentModerationDetail']
type ModerationAction = 'delete' | 'restore'
type VerificationStatus = 'cancelled' | 'complete' | 'required'

export type CommentModerationControlsLabels = {
  readonly title: string
  readonly deleteAction: string
  readonly restoreAction: string
  readonly reasonLabel: string
  readonly reasonDescription: string
  readonly reasonRequired: string
  readonly reasonTooLong: string
  readonly deleteWarning: string
  readonly restoreWarning: string
  readonly targetCommentLabel: string
  readonly targetAuthorLabel: string
  readonly confirmDeleteTitle: string
  readonly confirmDeleteDescription: string
  readonly confirmDeleteAction: string
  readonly confirmRestoreTitle: string
  readonly confirmRestoreDescription: string
  readonly confirmRestoreAction: string
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
  readonly successNotification: string
}

export type CommentModerationControlsProps = {
  readonly detail: CommentModerationDetail
  readonly labels: CommentModerationControlsLabels
  readonly principal: AdminPrincipal
}

const moderationDisabledReason = (
  principal: AdminPrincipal,
  detail: CommentModerationDetail,
  labels: CommentModerationControlsLabels,
): string | null => {
  if (principal.userId === detail.author.userId) return labels.disabledSelf
  if (detail.author.effectiveRole === 'super_admin') return labels.disabledSuperAdmin
  if (detail.author.effectiveRole === 'admin' && !canModerateUser(principal, detail.author.effectiveRole)) {
    return labels.disabledHierarchy
  }
  if (!canModerateUser(principal, detail.author.effectiveRole)) return labels.disabledCapability
  return null
}

const errorCopy = (kind: AdminErrorKind, labels: CommentModerationControlsLabels) => {
  if (kind === 'conflict') return labels.conflictError
  if (kind === 'forbidden') return labels.forbiddenError
  return labels.genericError
}

export const CommentModerationControls = ({ detail, labels, principal }: CommentModerationControlsProps) => {
  const data = useAdminData()
  const authActions = useAdminAuthActions()
  const recentAuth = useAdminRecentAuth()
  const queryClient = useQueryClient()
  const titleId = useId()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ModerationAction | null>(null)
  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(null)
  const [errorKind, setErrorKind] = useState<AdminErrorKind | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null)
  const [retryAction, setRetryAction] = useState<ModerationAction | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)
  const subjectCommentIdRef = useRef(detail.comment.id)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    subjectCommentIdRef.current = detail.comment.id
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
  }, [detail.comment.id])

  const disabledReason = moderationDisabledReason(principal, detail, labels)
  const selectedAction: ModerationAction = detail.state.status === 'visible' ? 'delete' : 'restore'

  const validateDeleteReason = () => {
    const result = validateCommentModerationReason(reason)
    if (result.ok) {
      setReasonError(null)
      return result.reason
    }
    setReasonError(result.issue === 'required' ? labels.reasonRequired : labels.reasonTooLong)
    return null
  }

  const refreshAuthoritativeState = async (
    commentId = detail.comment.id,
    authorUserId = detail.author.userId,
  ): Promise<void> => {
    await Promise.all([
      invalidateAfterCommentMutation(queryClient, commentId),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users.detail(authorUserId) }),
    ])
  }

  const completeForcedVerification = async (action: ModerationAction, subjectCommentId = detail.comment.id) => {
    setVerificationStatus('required')
    setRetryAction(action)
    const verified = await recentAuth.requestRecentAuth({ force: true })
    if (!mountedRef.current || subjectCommentIdRef.current !== subjectCommentId) return
    setVerificationStatus(verified ? 'complete' : 'cancelled')
  }

  const handleFailure = async (
    caught: unknown,
    action: ModerationAction,
    subjectCommentId: string,
    authorUserId: string,
  ) => {
    const presentation = normalizeAdminError(caught)
    if (presentation.kind === 'cancelled') return

    if (presentation.kind === 'recent-auth-required' && action === 'delete') {
      setErrorKind(null)
      await completeForcedVerification(action, subjectCommentId)
      return
    }
    if (presentation.kind === 'recent-auth-required') {
      setErrorKind('unexpected')
      setRetryAction(action)
      return
    }

    if (presentation.kind === 'conflict' || presentation.kind === 'forbidden') {
      await refreshAuthoritativeState(subjectCommentId, authorUserId)
    }
    authActions.reportFeatureError(caught)
    if (mountedRef.current && subjectCommentIdRef.current === subjectCommentId) {
      setErrorKind(presentation.kind)
      setRetryAction(action)
    }
  }

  const performAction = async (action: ModerationAction) => {
    if (inFlightRef.current || disabledReason !== null || action !== selectedAction) return
    const subjectCommentId = detail.comment.id
    const authorUserId = detail.author.userId
    const expectedStateVersion = detail.state.stateVersion
    const deleteReason = action === 'delete' ? validateDeleteReason() : null
    if (action === 'delete' && deleteReason === null) {
      setConfirmation(null)
      return
    }
    if (action === 'restore' && expectedStateVersion === null) {
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
      if (action === 'delete') {
        const verified = await recentAuth.requestRecentAuth()
        if (!mountedRef.current || subjectCommentIdRef.current !== subjectCommentId) return
        if (!verified) {
          setVerificationStatus('cancelled')
          setRetryAction(action)
          return
        }
      }

      const abort = new AbortController()
      abortRef.current = abort
      if (action === 'delete') {
        await data.client.deleteComment(
          {
            body: {
              confirmed: true,
              expectedStateVersion,
              reason: deleteReason!,
            },
            params: { commentId: subjectCommentId },
          },
          { signal: abort.signal },
        )
      } else {
        await data.client.restoreComment(
          {
            body: { confirmed: true, expectedStateVersion: expectedStateVersion! },
            params: { commentId: subjectCommentId },
          },
          { signal: abort.signal },
        )
      }

      await refreshAuthoritativeState(subjectCommentId, authorUserId)
      if (!mountedRef.current || subjectCommentIdRef.current !== subjectCommentId) return
      setReason('')
      setReasonError(null)
      notifications.show({ color: 'green', message: labels.successNotification })
    } catch (caught) {
      if (mountedRef.current && subjectCommentIdRef.current === subjectCommentId) {
        await handleFailure(caught, action, subjectCommentId, authorUserId)
      }
    } finally {
      if (subjectCommentIdRef.current === subjectCommentId) {
        abortRef.current = null
        inFlightRef.current = false
        if (mountedRef.current) setPendingAction(null)
      }
    }
  }

  const requestConfirmation = (action: ModerationAction) => {
    if (disabledReason !== null || inFlightRef.current || action !== selectedAction) return
    if (action === 'delete' && validateDeleteReason() === null) return
    setErrorKind(null)
    setVerificationStatus(null)
    setRetryAction(null)
    setConfirmation(action)
  }

  const reviewRetry = () => {
    if (retryAction === selectedAction) setConfirmation(retryAction)
  }

  const confirmationIsDelete = confirmation === 'delete'

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

        {selectedAction === 'delete' ? (
          <Stack gap="md">
            <Textarea
              description={labels.reasonDescription}
              disabled={disabledReason !== null}
              error={reasonError}
              label={labels.reasonLabel}
              maxLength={ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH + 1}
              minRows={3}
              onChange={(event) => {
                setReason(event.currentTarget.value)
                setReasonError(null)
              }}
              value={reason}
            />
            <Alert color="orange" role="note">
              {labels.deleteWarning}
            </Alert>
            <Button
              color="red"
              disabled={disabledReason !== null}
              loading={pendingAction === 'delete'}
              onClick={() => requestConfirmation('delete')}
            >
              {labels.deleteAction}
            </Button>
          </Stack>
        ) : (
          <Stack gap="md">
            <Alert color="blue" role="note">
              {labels.restoreWarning}
            </Alert>
            <Button
              disabled={disabledReason !== null}
              loading={pendingAction === 'restore'}
              onClick={() => requestConfirmation('restore')}
              variant="outline"
            >
              {labels.restoreAction}
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
          title={confirmationIsDelete ? labels.confirmDeleteTitle : labels.confirmRestoreTitle}
        >
          <Stack gap="md">
            <Text>{confirmationIsDelete ? labels.confirmDeleteDescription : labels.confirmRestoreDescription}</Text>
            <Stack gap={4}>
              <Text size="sm">{labels.targetCommentLabel}</Text>
              <Code>{detail.comment.id}</Code>
              <Text size="sm">{labels.targetAuthorLabel}</Text>
              <Text fw={600}>{detail.author.displayName}</Text>
              <Code>{detail.author.userId}</Code>
            </Stack>
            <Alert color={confirmationIsDelete ? 'orange' : 'blue'} role="note">
              {confirmationIsDelete ? labels.deleteWarning : labels.restoreWarning}
            </Alert>
            <Group justify="flex-end">
              <Button disabled={pendingAction !== null} onClick={() => setConfirmation(null)} variant="default">
                {labels.cancelAction}
              </Button>
              <Button
                color={confirmationIsDelete ? 'red' : undefined}
                loading={pendingAction === confirmation}
                onClick={() => {
                  if (confirmation !== null) void performAction(confirmation)
                }}
              >
                {confirmationIsDelete ? labels.confirmDeleteAction : labels.confirmRestoreAction}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Paper>
  )
}