import { Button, Chip, CircularProgress, IconButton, TextField } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import IconMdiDelete from '~icons/mdi/delete-outline'
import IconMdiPlus from '~icons/mdi/plus'
import IconMdiDevices from '~icons/mdi/devices'
import IconMdiLock from '~icons/mdi/lock-outline'
import IconPasskey from '~icons/material-symbols/passkey'
import aaguidData from '../../../data/passkey-aaguids.json'
import { authClient } from '../../../lib/auth-client'
import { ConfirmDialog, useConfirmDialog } from '../ConfirmDialog'

// -- Password Subsection --

const PasswordSubsection: FC = () => {
  const { t } = useTranslation(['auth'])
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const canSubmit = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0 && !mismatch

  const [changeState, handleChange] = useAsyncFn(async () => {
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
    if (error) {
      toast.error(t('auth:user-profile.password.error', { error: error.message }))
      return
    }
    toast.success(t('auth:user-profile.password.success'))
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }, [currentPassword, newPassword])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconMdiLock className="text-lg text-zinc-500" />
        <h2 className="text-base font-semibold m-0">{t('auth:user-profile.password.title')}</h2>
      </div>
      <div className="flex flex-col gap-3">
        <TextField
          label={t('auth:user-profile.password.current')}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          size="small"
          fullWidth
          autoComplete="current-password"
        />
        <TextField
          label={t('auth:user-profile.password.new')}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          size="small"
          fullWidth
          autoComplete="new-password"
        />
        <TextField
          label={t('auth:user-profile.password.confirm')}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          size="small"
          fullWidth
          error={mismatch}
          helperText={mismatch ? t('auth:user-profile.password.mismatch') : undefined}
          autoComplete="new-password"
        />
        <Button
          onClick={handleChange}
          disabled={!canSubmit || changeState.loading}
          variant="contained"
          className="!self-start"
        >
          {changeState.loading ? <CircularProgress size="1.25rem" /> : t('auth:user-profile.password.save')}
        </Button>
      </div>
    </div>
  )
}

// -- Passkeys Subsection --

// AAGUID database from https://github.com/passkeydeveloper/passkey-authenticator-aaguids
const aaguids = aaguidData as Record<string, { name: string; icon?: string }>

function getPasskeyInfo(passkey: PasskeyItem): { name: string; icon?: string } {
  const entry = passkey.aaguid ? aaguids[passkey.aaguid] : undefined
  const name = passkey.name || entry?.name || (passkey.deviceType === 'singleDevice' ? 'Security Key' : 'Passkey')
  return { name, icon: entry?.icon }
}

interface PasskeyItem {
  id: string
  name?: string | null
  createdAt: Date
  aaguid?: string | null
  deviceType?: string | null
}

const PasskeysSubsection: FC = () => {
  const { t } = useTranslation(['auth'])
  const queryClient = useQueryClient()
  const confirmDelete = useConfirmDialog()

  const { data: passkeys = [], isLoading: loading } = useQuery({
    queryKey: ['passkeys'],
    queryFn: async () => {
      const res = await authClient.passkey.listUserPasskeys()
      return (res.data ?? []) as PasskeyItem[]
    },
  })

  const [addState, handleAdd] = useAsyncFn(async () => {
    const res = await authClient.passkey.addPasskey()
    if (res.error) {
      if (res.error.message) {
        toast.error(t('auth:user-profile.passkeys.error', { error: res.error.message }))
      }
      return
    }
    toast.success(t('auth:user-profile.passkeys.added'))
    queryClient.invalidateQueries({ queryKey: ['passkeys'] })
  }, [queryClient])

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDelete.confirm()
    if (!confirmed) return
    try {
      await authClient.passkey.deletePasskey({ id })
      toast.success(t('auth:user-profile.passkeys.deleted'))
      queryClient.invalidateQueries({ queryKey: ['passkeys'] })
    } catch (e: any) {
      toast.error(t('auth:user-profile.passkeys.error', { error: e.message }))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={confirmDelete.open}
        title={t('auth:user-profile.passkeys.confirm-delete-title')}
        description={t('auth:user-profile.passkeys.confirm-delete-description')}
        confirmLabel={t('auth:user-profile.confirm-ok')}
        cancelLabel={t('auth:user-profile.confirm-cancel')}
        onConfirm={confirmDelete.onConfirm}
        onCancel={confirmDelete.onCancel}
      />

      <div className="flex items-center gap-2">
        <IconPasskey className="text-lg text-zinc-500" />
        <h2 className="text-base font-semibold m-0">{t('auth:user-profile.passkeys.title')}</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <CircularProgress size="1.5rem" />
        </div>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-zinc-500 m-0">{t('auth:user-profile.passkeys.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {passkeys.map((pk) => {
            const info = getPasskeyInfo(pk)
            return (
              <div key={pk.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                {info.icon ? (
                  <img src={info.icon} alt="" className="size-5 shrink-0" />
                ) : (
                  <IconPasskey className="text-lg text-zinc-400 shrink-0" />
                )}
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">{info.name}</span>
                  <span className="text-xs text-zinc-400">{new Date(pk.createdAt).toLocaleDateString()}</span>
                </div>
                <IconButton size="small" onClick={() => handleDelete(pk.id)} className="!text-red-500">
                  <IconMdiDelete className="text-lg" />
                </IconButton>
              </div>
            )
          })}
        </div>
      )}

      <Button
        onClick={handleAdd}
        disabled={addState.loading}
        variant="outlined"
        startIcon={addState.loading ? <CircularProgress size="1rem" /> : <IconMdiPlus />}
        className="!self-start"
      >
        {t('auth:user-profile.passkeys.add')}
      </Button>
    </div>
  )
}

// -- Active Devices Subsection --

interface SessionItem {
  id: string
  token: string
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: Date
}

function parseUserAgent(ua?: string | null): string {
  if (!ua) return 'Unknown device'

  let browser = 'Unknown browser'
  if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'

  let os = ''
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Linux')) os = 'Linux'

  return os ? `${browser} on ${os}` : browser
}

const DevicesSubsection: FC<{ currentSessionToken?: string }> = ({ currentSessionToken }) => {
  const { t } = useTranslation(['auth'])
  const queryClient = useQueryClient()
  const confirmRevoke = useConfirmDialog()

  const { data: sessions = [], isLoading: loading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await authClient.listSessions()
      return (res.data ?? []) as SessionItem[]
    },
  })

  const handleRevoke = async (token: string) => {
    const confirmed = await confirmRevoke.confirm()
    if (!confirmed) return
    try {
      await authClient.revokeSession({ token })
      toast.success(t('auth:user-profile.devices.revoked'))
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={confirmRevoke.open}
        title={t('auth:user-profile.devices.confirm-revoke-title')}
        description={t('auth:user-profile.devices.confirm-revoke-description')}
        confirmLabel={t('auth:user-profile.confirm-ok')}
        cancelLabel={t('auth:user-profile.confirm-cancel')}
        onConfirm={confirmRevoke.onConfirm}
        onCancel={confirmRevoke.onCancel}
      />

      <div className="flex items-center gap-2">
        <IconMdiDevices className="text-lg text-zinc-500" />
        <h2 className="text-base font-semibold m-0">{t('auth:user-profile.devices.title')}</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <CircularProgress size="1.5rem" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => {
            const isCurrent = session.token === currentSessionToken
            return (
              <div
                key={session.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50"
              >
                <IconMdiDevices className="text-lg text-zinc-400 shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{parseUserAgent(session.userAgent)}</span>
                    {isCurrent && (
                      <Chip
                        label={t('auth:user-profile.devices.current')}
                        size="small"
                        color="success"
                        variant="outlined"
                        className="!h-5 !text-xs"
                      />
                    )}
                  </div>
                  <span className="text-xs text-zinc-400">{session.ipAddress || 'Unknown IP'}</span>
                </div>
                {!isCurrent && (
                  <Button
                    size="small"
                    onClick={() => handleRevoke(session.token)}
                    color="error"
                    variant="text"
                    className="!text-xs !shrink-0"
                  >
                    {t('auth:user-profile.devices.revoke')}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -- Main Security Section --

export const SecuritySection: FC<{ currentSessionToken?: string }> = ({ currentSessionToken }) => {
  const { t } = useTranslation(['auth'])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold m-0">{t('auth:user-profile.security')}</h1>
      </div>

      <PasswordSubsection />

      <div className="h-px bg-zinc-200 dark:bg-zinc-700" />

      <PasskeysSubsection />

      <div className="h-px bg-zinc-200 dark:bg-zinc-700" />

      <DevicesSubsection currentSessionToken={currentSessionToken} />
    </div>
  )
}