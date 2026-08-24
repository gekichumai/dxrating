import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { Button, Divider, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core'
import { IconBrandGoogle, IconKey } from '@tabler/icons-react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { AdminErrorNotice } from '../components/admin-error-notice'
import { useAdminData } from '../data/admin-data-context'
import { adminQueryKeys } from '../data/query-keys'
import { useAdminAuth, useAdminAuthActions } from './admin-auth-context'

export const ADMIN_RECENT_AUTH_MAX_AGE_MS = 10 * 60 * 1_000
const ADMIN_PRIMARY_AUTH_GOOGLE_ORIGIN = 'https://accounts.google.com'

type AdminPrimaryAuthStatus = AdminContractOutputs['primaryAuthStatus']

export type AdminRecentAuthObservation = {
  readonly observedAt: number
  readonly status: AdminPrimaryAuthStatus | undefined
}

export const isAdminRecentAuthValid = (
  { observedAt, status }: AdminRecentAuthObservation,
  now = Date.now(),
): boolean => {
  if (!status?.active || status.expiresAt === null) return false
  if (!Number.isFinite(observedAt) || observedAt <= 0 || !Number.isFinite(now)) return false

  const serverExpiry = Date.parse(status.expiresAt)
  if (!Number.isFinite(serverExpiry)) return false

  const effectiveExpiry = Math.min(serverExpiry, observedAt + ADMIN_RECENT_AUTH_MAX_AGE_MS)
  return now < effectiveExpiry
}

export const normalizeAdminPrimaryAuthOauthUrl = (candidate: string): string | null => {
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || url.origin !== ADMIN_PRIMARY_AUTH_GOOGLE_ORIGIN || url.username || url.password) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export type AdminRecentAuthLabels = {
  readonly cancel: string
  readonly description: string
  readonly googleSubmit: string
  readonly or: string
  readonly passwordLabel: string
  readonly passwordSubmit: string
  readonly title: string
}

export type AdminRecentAuthContextValue = {
  /**
   * Synchronously checks the last server observation. This is presentation
   * convenience only; the backend still authorizes every destructive action.
   */
  readonly hasValidRecentAuth: () => boolean
  /**
   * Requests primary authentication and resolves with the outcome. It never
   * accepts or invokes a destructive callback, so callers cannot accidentally
   * replay a failed mutation.
   */
  readonly requestRecentAuth: (options?: AdminRecentAuthRequestOptions) => Promise<boolean>
}

export type AdminRecentAuthRequestOptions = {
  /**
   * Discards the cached primary-auth observation before prompting. Callers use
   * this after the backend rejects an action with RECENT_AUTH_REQUIRED.
   */
  readonly force?: boolean
}

const AdminRecentAuthContext = createContext<AdminRecentAuthContextValue | undefined>(undefined)

export const useAdminRecentAuth = (): AdminRecentAuthContextValue => {
  const value = useContext(AdminRecentAuthContext)
  if (!value) throw new Error('useAdminRecentAuth must be used inside AdminRecentAuthProvider')
  return value
}

type PendingRequest = {
  readonly promise: Promise<boolean>
  readonly resolve: (result: boolean) => void
}

const readRecentAuthObservation = (queryClient: QueryClient): AdminRecentAuthObservation => {
  const queryKey = adminQueryKeys.primaryAuth.status()
  return {
    status: queryClient.getQueryData<AdminPrimaryAuthStatus>(queryKey),
    observedAt: queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0,
  }
}

const defaultOauthNavigation = (url: string) => globalThis.location.assign(url)

export type AdminRecentAuthProviderProps = {
  readonly children: ReactNode
  readonly labels: AdminRecentAuthLabels
  readonly navigateToOauth?: (url: string) => void
  readonly now?: () => number
}

export const AdminRecentAuthProvider = ({
  children,
  labels,
  navigateToOauth = defaultOauthNavigation,
  now = Date.now,
}: AdminRecentAuthProviderProps) => {
  const auth = useAdminAuth()
  const authActions = useAdminAuthActions()
  const data = useAdminData()
  const queryClient = useQueryClient()
  const [opened, setOpened] = useState(false)
  const [pendingMethod, setPendingMethod] = useState<'google' | 'password' | null>(null)
  const [error, setError] = useState<unknown>()
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const requestRef = useRef<PendingRequest | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)

  const hasValidRecentAuth = useCallback(
    () => isAdminRecentAuthValid(readRecentAuthObservation(queryClient), now()),
    [now, queryClient],
  )

  const clearSensitiveUi = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = undefined
    formRef.current?.reset()
    setError(undefined)
    setPendingMethod(null)
  }, [])

  const handleDirectRequestError = useCallback(
    (caught: unknown, signal: AbortSignal) => {
      if (!signal.aborted && !authActions.reportFeatureError(caught)) setError(caught)
    },
    [authActions],
  )

  const finishRequest = useCallback(
    (result: boolean) => {
      const request = requestRef.current
      requestRef.current = undefined
      clearSensitiveUi()
      setOpened(false)
      request?.resolve(result)
    },
    [clearSensitiveUi],
  )

  const requestRecentAuth = useCallback(
    (options?: AdminRecentAuthRequestOptions): Promise<boolean> => {
      if (auth.status !== 'authenticated') return Promise.resolve(false)
      if (requestRef.current) return requestRef.current.promise
      if (options?.force) {
        queryClient.removeQueries({ exact: true, queryKey: adminQueryKeys.primaryAuth.status() })
      } else if (hasValidRecentAuth()) {
        return Promise.resolve(true)
      }

      let resolveRequest: (result: boolean) => void = () => undefined
      const promise = new Promise<boolean>((resolve) => {
        resolveRequest = resolve
      })
      requestRef.current = { promise, resolve: resolveRequest }
      setError(undefined)
      setOpened(true)
      return promise
    },
    [auth.status, hasValidRecentAuth, queryClient],
  )

  useEffect(() => {
    if (auth.status !== 'authenticated' && requestRef.current) finishRequest(false)
  }, [auth.status, finishRequest])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      requestRef.current?.resolve(false)
      requestRef.current = undefined
      formRef.current?.reset()
    },
    [],
  )

  const completePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pendingMethod !== null) return

    const form = event.currentTarget
    const value = new FormData(form).get('password')
    form.reset()
    if (typeof value !== 'string' || value.length === 0) {
      passwordInputRef.current?.focus()
      return
    }

    const abort = new AbortController()
    abortRef.current = abort
    setError(undefined)
    setPendingMethod('password')

    try {
      const completion = await data.client.completePrimaryAuthPassword(
        { body: { password: value } },
        { signal: abort.signal },
      )
      const observedAt = now()
      queryClient.setQueryData<AdminPrimaryAuthStatus>(
        adminQueryKeys.primaryAuth.status(),
        { active: true, expiresAt: completion.expiresAt },
        { updatedAt: observedAt },
      )

      if (!hasValidRecentAuth()) {
        setError(new Error('The primary-authentication window is not valid'))
        return
      }
      finishRequest(true)
    } catch (caught) {
      handleDirectRequestError(caught, abort.signal)
    } finally {
      if (abortRef.current === abort) abortRef.current = undefined
      setPendingMethod(null)
      form.reset()
    }
  }

  const initiateGoogle = async () => {
    if (pendingMethod !== null) return

    formRef.current?.reset()
    const abort = new AbortController()
    abortRef.current = abort
    setError(undefined)
    setPendingMethod('google')

    try {
      const result = await data.client.initiatePrimaryAuthOauth(
        { body: { provider: 'google' } },
        { signal: abort.signal },
      )
      const authorizationUrl = normalizeAdminPrimaryAuthOauthUrl(result.authorizationUrl)
      if (!authorizationUrl) throw new Error('The OAuth authorization URL is not safe')

      navigateToOauth(authorizationUrl)
      finishRequest(false)
    } catch (caught) {
      handleDirectRequestError(caught, abort.signal)
    } finally {
      if (abortRef.current === abort) abortRef.current = undefined
      setPendingMethod(null)
    }
  }

  const contextValue = useMemo<AdminRecentAuthContextValue>(
    () => ({ hasValidRecentAuth, requestRecentAuth }),
    [hasValidRecentAuth, requestRecentAuth],
  )

  return (
    <AdminRecentAuthContext.Provider value={contextValue}>
      {children}
      <Modal
        centered
        closeButtonProps={{ 'aria-label': `${labels.cancel}: ${labels.title}` }}
        onEnterTransitionEnd={() => passwordInputRef.current?.focus()}
        onClose={() => finishRequest(false)}
        opened={opened}
        title={labels.title}
      >
        <Stack aria-busy={pendingMethod !== null} gap="md">
          <Text c="dimmed" size="sm">
            {labels.description}
          </Text>
          {error ? <AdminErrorNotice error={error} /> : null}
          <form onSubmit={(event) => void completePassword(event)} ref={formRef}>
            <Stack gap="sm">
              <PasswordInput
                autoComplete="current-password"
                disabled={pendingMethod !== null}
                id="admin-recent-auth-password"
                label={labels.passwordLabel}
                name="password"
                ref={passwordInputRef}
                required
              />
              <Button
                fullWidth
                leftSection={<IconKey aria-hidden="true" size={18} />}
                loading={pendingMethod === 'password'}
                type="submit"
              >
                {labels.passwordSubmit}
              </Button>
            </Stack>
          </form>
          <Divider label={labels.or} labelPosition="center" />
          <Button
            fullWidth
            leftSection={<IconBrandGoogle aria-hidden="true" size={18} />}
            loading={pendingMethod === 'google'}
            onClick={() => void initiateGoogle()}
            variant="default"
          >
            {labels.googleSubmit}
          </Button>
          <Group justify="flex-end">
            <Button onClick={() => finishRequest(false)} variant="subtle">
              {labels.cancel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AdminRecentAuthContext.Provider>
  )
}