import { Button, CircularProgress } from '@mui/material'
import { type FC, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import IconLogosGithub from '~icons/logos/github-icon'
import IconLogosGoogle from '~icons/logos/google-icon'
import IconMdiLinkVariant from '~icons/mdi/link-variant'
import { authClient } from '../../../lib/auth-client'
import { formatErrorMessage } from '../../../utils/formatErrorMessage'
import { ConfirmDialog, useConfirmDialog } from '../ConfirmDialog'

interface AccountItem {
  id: string
  providerId: string
  accountId: string
}

const PROVIDERS: {
  id: string
  icon: FC<{ className?: string }>
  labelKey: string
}[] = [
  { id: 'google', icon: IconLogosGoogle, labelKey: 'auth:user-profile.accounts.google' },
  { id: 'github', icon: IconLogosGithub, labelKey: 'auth:user-profile.accounts.github' },
]

export const ConnectedAccountsSection: FC = () => {
  const { t } = useTranslation(['auth'])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [loading, setLoading] = useState(true)
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null)
  const confirmDisconnect = useConfirmDialog()

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authClient.listAccounts()
      if (res.data) {
        setAccounts(res.data as AccountItem[])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Count total auth methods: social accounts + credential (email/password) account + passkeys
  const hasCredentialAccount = accounts.some((a) => a.providerId === 'credential')
  const socialAccounts = accounts.filter((a) => a.providerId !== 'credential')
  const totalMethods = accounts.length

  const handleConnect = async (provider: string) => {
    setConnectingProvider(provider)
    await authClient.linkSocial({
      provider,
      callbackURL: window.location.href,
      errorCallbackURL: window.location.href,
    })
    // Redirects away, no cleanup needed
  }

  const handleDisconnect = async (providerId: string) => {
    const account = accounts.find((item) => item.providerId === providerId)
    if (!account) return
    const confirmed = await confirmDisconnect.confirm()
    if (!confirmed) return
    setDisconnectingProvider(providerId)
    try {
      await authClient.unlinkAccount({ accountId: account.id })
      toast.success(t('auth:user-profile.accounts.disconnected'))
      setAccounts((prev) => prev.filter((a) => a.providerId !== providerId))
    } catch (e: unknown) {
      toast.error(t('auth:user-profile.accounts.error', { error: formatErrorMessage(e) }))
    } finally {
      setDisconnectingProvider(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <ConfirmDialog
        open={confirmDisconnect.open}
        title={t('auth:user-profile.accounts.confirm-disconnect-title')}
        description={t('auth:user-profile.accounts.confirm-disconnect-description')}
        confirmLabel={t('auth:user-profile.accounts.confirm-disconnect-button')}
        confirmColor="error"
        cancelLabel={t('auth:user-profile.confirm-cancel')}
        onConfirm={confirmDisconnect.onConfirm}
        onCancel={confirmDisconnect.onCancel}
      />

      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold leading-snug text-fg-1 m-0">{t('auth:user-profile.accounts.title')}</h3>
        <p className="text-sm text-fg-2 m-0">{t('auth:user-profile.accounts.description')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <CircularProgress size="1.5rem" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {PROVIDERS.map(({ id, icon: Icon, labelKey }) => {
            const connected = socialAccounts.find((a) => a.providerId === id)
            const canDisconnect = totalMethods > 1
            const statusId = `connected-account-${id}-status`

            return (
              <div key={id} className="glass-inset flex items-center gap-3 py-3 px-4">
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-semibold text-fg-1">{t(labelKey)}</span>
                  <span id={statusId} className="text-xs text-fg-2 text-pretty">
                    {connected
                      ? canDisconnect
                        ? t('auth:user-profile.accounts.connected')
                        : t('auth:user-profile.accounts.disconnect-unavailable')
                      : t('auth:user-profile.accounts.not-connected')}
                  </span>
                </div>
                {connected ? (
                  <Button
                    size="small"
                    onClick={() => handleDisconnect(id)}
                    disabled={!canDisconnect || disconnectingProvider === id}
                    aria-describedby={statusId}
                    color="error"
                    variant="text"
                    className="!text-xs !shrink-0"
                  >
                    {disconnectingProvider === id ? (
                      <CircularProgress size={16} />
                    ) : (
                      t('auth:user-profile.accounts.disconnect')
                    )}
                  </Button>
                ) : (
                  <Button
                    size="small"
                    onClick={() => handleConnect(id)}
                    disabled={connectingProvider !== null}
                    variant="outlined"
                    className="!text-xs !shrink-0"
                  >
                    {connectingProvider === id ? (
                      <CircularProgress size={16} />
                    ) : (
                      t('auth:user-profile.accounts.connect')
                    )}
                  </Button>
                )}
              </div>
            )
          })}

          {/* Email/password info */}
          <div className="glass-inset flex items-center gap-3 py-3 px-4">
            <IconMdiLinkVariant className="w-5 h-5 shrink-0 text-fg-2" aria-hidden="true" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-semibold text-fg-1">{t('auth:user-profile.accounts.email-password')}</span>
              <span className="text-xs text-fg-2">
                {hasCredentialAccount
                  ? t('auth:user-profile.accounts.connected')
                  : t('auth:user-profile.accounts.not-connected')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}