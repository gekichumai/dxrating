import { Button, Chip, CircularProgress, IconButton, TextField } from '@mui/material'
import { type FC, useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import IconMdiDelete from '~icons/mdi/delete-outline'
import IconMdiKey from '~icons/mdi/key'
import IconMdiPlus from '~icons/mdi/plus'
import IconMdiDevices from '~icons/mdi/devices'
import IconMdiLock from '~icons/mdi/lock-outline'
import IconPasskey from '~icons/material-symbols/passkey'
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

// Common AAGUID → authenticator name mapping
// See https://github.com/passkeydeveloper/passkey-authenticator-aaguids
const AAGUID_MAP: Record<string, string> = {
  // Apple
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
  '00000000-0000-0000-0000-000000000000': 'iCloud Keychain',
  // 1Password
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': '1Password',
  // Bitwarden
  'aaguidof-bw00-pass-key0-000000000000': 'Bitwarden',
  // Google Password Manager
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  // Dashlane
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
  // Windows Hello
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a7': 'Windows Hello',
  // YubiKey
  'cb69481e-8ff7-4039-93ec-0a2729a154a8': 'YubiKey 5',
  'ee882879-721c-4913-9775-3dfcce97072a': 'YubiKey 5',
  'fa2b99dc-9e39-4257-8f92-4a30d23c4118': 'YubiKey 5 FIPS',
  '73bb0cd4-e502-49b8-9c6f-b59445bf720b': 'YubiKey 5 FIPS',
  'c5ef55ff-ad9a-4b9f-b580-adebafe026d0': 'YubiKey 5Ci FIPS',
  '2fc0579f-8113-47ea-b116-bb5a8db9202a': 'YubiKey 5 NFC',
  'b92c3f9a-c014-4056-887f-140a2501163b': 'Security Key by Yubico',
  'f8a011f3-8c0a-4d15-8006-17111f9edc7d': 'Security Key by Yubico',
  '6d44ba9b-f6ec-2e49-b930-0c8fe920cb73': 'Security Key by Yubico',
  // Samsung
  '53414d53-554e-4700-0000-000000000000': 'Samsung Pass',
  // Chromium / Chrome
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
}

function getPasskeyDisplayName(passkey: PasskeyItem): string {
  if (passkey.name) return passkey.name
  if (passkey.aaguid) {
    const known = AAGUID_MAP[passkey.aaguid]
    if (known) return known
  }
  if (passkey.deviceType === 'singleDevice') return 'Security Key'
  return 'Passkey'
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
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const confirmDelete = useConfirmDialog()

  const fetchPasskeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authClient.passkey.listUserPasskeys()
      if (res.data) {
        setPasskeys(res.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPasskeys()
  }, [fetchPasskeys])

  const [addState, handleAdd] = useAsyncFn(async () => {
    const res = await authClient.passkey.addPasskey()
    if (res.error) {
      // User cancelled the WebAuthn ceremony or other error
      if (res.error.message) {
        toast.error(t('auth:user-profile.passkeys.error', { error: res.error.message }))
      }
      return
    }
    toast.success(t('auth:user-profile.passkeys.added'))
    fetchPasskeys()
  }, [fetchPasskeys])

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDelete.confirm()
    if (!confirmed) return
    try {
      await authClient.passkey.deletePasskey({ id })
      toast.success(t('auth:user-profile.passkeys.deleted'))
      setPasskeys((prev) => prev.filter((p) => p.id !== id))
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
          {passkeys.map((pk) => (
            <div key={pk.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
              <IconMdiKey className="text-lg text-zinc-400 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate">{getPasskeyDisplayName(pk)}</span>
                <span className="text-xs text-zinc-400">{new Date(pk.createdAt).toLocaleDateString()}</span>
              </div>
              <IconButton size="small" onClick={() => handleDelete(pk.id)} className="!text-red-500">
                <IconMdiDelete className="text-lg" />
              </IconButton>
            </div>
          ))}
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
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)
  const confirmRevoke = useConfirmDialog()

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authClient.listSessions()
      if (res.data) {
        setSessions(res.data as SessionItem[])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleRevoke = async (token: string) => {
    const confirmed = await confirmRevoke.confirm()
    if (!confirmed) return
    try {
      await authClient.revokeSession({ token })
      toast.success(t('auth:user-profile.devices.revoked'))
      setSessions((prev) => prev.filter((s) => s.token !== token))
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