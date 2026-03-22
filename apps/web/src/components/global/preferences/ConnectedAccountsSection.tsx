import { Button, CircularProgress } from '@mui/material'
import { type FC, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import IconLogosGithub from '~icons/logos/github-icon'
import IconLogosGoogle from '~icons/logos/google-icon'
import IconMdiLinkVariant from '~icons/mdi/link-variant'
import { authClient } from '../../../lib/auth-client'
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
    const confirmed = await confirmDisconnect.confirm()
    if (!confirmed) return
    setDisconnectingProvider(providerId)
    try {
      await authClient.unlinkAccount({ providerId })
      toast.success(t('auth:user-profile.accounts.disconnected'))
      setAccounts((prev) => prev.filter((a) => a.providerId !== providerId))
    } catch (e: any) {
      toast.error(t('auth:user-profile.accounts.error', { error: e.message }))
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
        confirmLabel={t('auth:user-profile.confirm-ok')}
        cancelLabel={t('auth:user-profile.confirm-cancel')}
        onConfirm={confirmDisconnect.onConfirm}
        onCancel={confirmDisconnect.onCancel}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold m-0">{t('auth:user-profile.accounts.title')}</h1>
        <p className="text-sm text-zinc-500 m-0">{t('auth:user-profile.accounts.description')}</p>
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

            return (
              <div key={id} className="flex items-center gap-3 py-3 px-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                <Icon className="w-5 h-5 shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium">{t(labelKey)}</span>
                  <span className="text-xs text-zinc-400">
                    {connected
                      ? t('auth:user-profile.accounts.connected')
                      : t('auth:user-profile.accounts.not-connected')}
                  </span>
                </div>
                {connected ? (
                  <Button
                    size="small"
                    onClick={() => handleDisconnect(id)}
                    disabled={!canDisconnect || disconnectingProvider === id}
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
          <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
            <IconMdiLinkVariant className="w-5 h-5 shrink-0 text-zinc-400" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium">{t('auth:user-profile.accounts.email-password')}</span>
              <span className="text-xs text-zinc-400">
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