import { Button, Chip, CircularProgress, IconButton, TextField } from '@mui/material'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FC, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import type { SupportedLocale } from '@/setup/locale'
import { useAsyncFn } from 'react-use'
import IconMdiDelete from '~icons/mdi/delete-outline'
import IconMdiPlus from '~icons/mdi/plus'
import IconMdiDevices from '~icons/mdi/devices'
import IconMdiLock from '~icons/mdi/lock-outline'
import IconPasskey from '~icons/material-symbols/passkey'
import aaguidData from '../../../data/passkey-aaguids.json'
import { authClient } from '../../../lib/auth-client'
import { formatErrorMessage } from '../../../utils/formatErrorMessage'
import { PasswordVisibilityAdornment } from '../../auth/PasswordVisibilityAdornment'
import { ConfirmDialog, useConfirmDialog } from '../ConfirmDialog'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

// -- Password Subsection --

type HeadingTag = 'h2' | 'h4'

const PasswordSubsection: FC<{ idPrefix: string; headingAs: HeadingTag }> = ({ idPrefix, headingAs: Heading }) => {
  const locale = useLocale()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, new: false, confirm: false })

  // Required-field errors appear after the first submit attempt; the mismatch shows as soon as both fields differ
  const [attempted, setAttempted] = useState(false)
  const currentRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const canSubmit = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0 && !mismatch
  const currentMissing = attempted && currentPassword.length === 0
  const newMissing = attempted && newPassword.length === 0
  const confirmMissing = attempted && confirmPassword.length === 0

  const [changeState, handleChange] = useAsyncFn(async () => {
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
    if (error) {
      toast.error(m.auth_userProfile_password_error({ error: error.message ?? '' }, { locale }))
      return
    }
    toast.success(m.auth_userProfile_password_success({}, { locale }))
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setAttempted(false)
  }, [currentPassword, newPassword])

  const togglePasswordVisibility = (field: keyof typeof visiblePasswords) => {
    setVisiblePasswords((visible) => ({ ...visible, [field]: !visible[field] }))
  }

  const titleId = `${idPrefix}-password-settings-title`
  const currentPasswordId = `${idPrefix}-current-password`
  const newPasswordId = `${idPrefix}-new-password`
  const confirmPasswordId = `${idPrefix}-confirm-password`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconMdiLock className="text-lg text-fg-2" aria-hidden="true" />
        <Heading id={titleId} className="text-base font-semibold text-fg-1 m-0">
          {m.auth_userProfile_password_title({}, { locale })}
        </Heading>
      </div>
      <form
        aria-labelledby={titleId}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (changeState.loading) return
          if (!canSubmit) {
            setAttempted(true)
            // Focus the first field that needs attention
            if (currentPassword.length === 0) currentRef.current?.focus()
            else if (newPassword.length === 0) newRef.current?.focus()
            else confirmRef.current?.focus()
            return
          }
          void handleChange()
        }}
        noValidate
      >
        <TextField
          id={currentPasswordId}
          name="current-password"
          label={m.auth_userProfile_password_current({}, { locale })}
          type={visiblePasswords.current ? 'text' : 'password'}
          inputRef={currentRef}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={currentMissing}
          helperText={currentMissing ? m.auth_userProfile_password_currentRequired({}, { locale }) : undefined}
          size="small"
          fullWidth
          autoComplete="current-password"
          required
          InputProps={{
            endAdornment: (
              <PasswordVisibilityAdornment
                visible={visiblePasswords.current}
                fieldLabel={m.auth_userProfile_password_current({}, { locale })}
                inputId={currentPasswordId}
                onToggle={() => togglePasswordVisibility('current')}
              />
            ),
          }}
        />
        <TextField
          id={newPasswordId}
          name="new-password"
          label={m.auth_userProfile_password_new({}, { locale })}
          type={visiblePasswords.new ? 'text' : 'password'}
          inputRef={newRef}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={newMissing}
          helperText={newMissing ? m.auth_userProfile_password_newRequired({}, { locale }) : undefined}
          size="small"
          fullWidth
          autoComplete="new-password"
          required
          InputProps={{
            endAdornment: (
              <PasswordVisibilityAdornment
                visible={visiblePasswords.new}
                fieldLabel={m.auth_userProfile_password_new({}, { locale })}
                inputId={newPasswordId}
                onToggle={() => togglePasswordVisibility('new')}
              />
            ),
          }}
        />
        <TextField
          id={confirmPasswordId}
          name="confirm-password"
          label={m.auth_userProfile_password_confirm({}, { locale })}
          type={visiblePasswords.confirm ? 'text' : 'password'}
          inputRef={confirmRef}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          size="small"
          fullWidth
          error={mismatch || confirmMissing}
          helperText={
            mismatch
              ? m.auth_userProfile_password_mismatch({}, { locale })
              : confirmMissing
                ? m.auth_userProfile_password_confirmRequired({}, { locale })
                : undefined
          }
          autoComplete="new-password"
          required
          InputProps={{
            endAdornment: (
              <PasswordVisibilityAdornment
                visible={visiblePasswords.confirm}
                fieldLabel={m.auth_userProfile_password_confirm({}, { locale })}
                inputId={confirmPasswordId}
                onToggle={() => togglePasswordVisibility('confirm')}
              />
            ),
          }}
        />
        <Button
          type="submit"
          disabled={changeState.loading}
          aria-busy={changeState.loading || undefined}
          variant="contained"
          className="!self-start"
        >
          {changeState.loading ? (
            <CircularProgress size="1.25rem" color="inherit" aria-label={m.auth_userProfile_saving({}, { locale })} />
          ) : (
            m.auth_userProfile_password_save({}, { locale })
          )}
        </Button>
      </form>
    </div>
  )
}

// -- Passkeys Subsection --

// AAGUID database from https://github.com/passkeydeveloper/passkey-authenticator-aaguids
const aaguids = aaguidData as Record<string, { name: string; icon?: string }>

function getPasskeyInfo(passkey: PasskeyItem, locale: SupportedLocale): { name: string; icon?: string } {
  const entry = passkey.aaguid ? aaguids[passkey.aaguid] : undefined
  const name =
    passkey.name ||
    entry?.name ||
    (passkey.deviceType === 'singleDevice'
      ? m.auth_userProfile_passkeys_fallbackSecurityKey({}, { locale })
      : m.auth_userProfile_passkeys_fallbackPasskey({}, { locale }))
  return { name, icon: entry?.icon }
}

interface PasskeyItem {
  id: string
  name?: string | null
  createdAt: Date
  aaguid?: string | null
  deviceType?: string | null
}

// Client-only: the passkey list is fetched after mount, so formatting in the viewer's locale and time zone is safe here
const PasskeyCreatedDate: FC<{ createdAt: Date }> = ({ createdAt }) => {
  const locale = useLocale()
  const formattedDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(createdAt)),
    [createdAt, locale],
  )

  return (
    <span className="text-xs text-fg-2">
      {m.auth_userProfile_passkeys_created({ date: formattedDate }, { locale })}
    </span>
  )
}

const PasskeysSubsection: FC<{ headingAs: HeadingTag }> = ({ headingAs: Heading }) => {
  const locale = useLocale()
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
      toast.error(m.auth_userProfile_passkeys_error({ error: formatErrorMessage(res.error) }, { locale }))
      return
    }
    toast.success(m.auth_userProfile_passkeys_added({}, { locale }))
    queryClient.invalidateQueries({ queryKey: ['passkeys'] })
  }, [queryClient])

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDelete.confirm()
    if (!confirmed) return
    try {
      await authClient.passkey.deletePasskey({ id })
      toast.success(m.auth_userProfile_passkeys_deleted({}, { locale }))
      queryClient.invalidateQueries({ queryKey: ['passkeys'] })
    } catch (e: unknown) {
      toast.error(m.auth_userProfile_passkeys_error({ error: formatErrorMessage(e) }, { locale }))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={confirmDelete.open}
        title={m.auth_userProfile_passkeys_confirmDeleteTitle({}, { locale })}
        description={m.auth_userProfile_passkeys_confirmDeleteDescription({}, { locale })}
        confirmLabel={m.auth_userProfile_passkeys_confirmDeleteButton({}, { locale })}
        confirmColor="error"
        cancelLabel={m.auth_userProfile_confirmCancel({}, { locale })}
        onConfirm={confirmDelete.onConfirm}
        onCancel={confirmDelete.onCancel}
      />

      <div className="flex items-center gap-2">
        <IconPasskey className="text-lg text-fg-2" aria-hidden="true" />
        <Heading className="text-base font-semibold text-fg-1 m-0">
          {m.auth_userProfile_passkeys_title({}, { locale })}
        </Heading>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <CircularProgress size="1.5rem" />
        </div>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-fg-2 m-0">{m.auth_userProfile_passkeys_empty({}, { locale })}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {passkeys.map((pk) => {
            const info = getPasskeyInfo(pk, locale)
            return (
              <div key={pk.id} className="glass-inset flex items-center gap-3 py-2 px-3">
                {info.icon ? (
                  <img src={info.icon} alt="" className="size-5 shrink-0" />
                ) : (
                  <IconPasskey className="text-lg text-fg-2 shrink-0" aria-hidden="true" />
                )}
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-semibold text-fg-1 truncate">{info.name}</span>
                  <PasskeyCreatedDate createdAt={pk.createdAt} />
                </div>
                <IconButton
                  size="small"
                  onClick={() => handleDelete(pk.id)}
                  aria-label={m.auth_userProfile_passkeys_deleteNamed({ name: info.name }, { locale })}
                  title={m.auth_userProfile_passkeys_deleteNamed({ name: info.name }, { locale })}
                  className="!text-danger"
                >
                  <IconMdiDelete className="text-lg" aria-hidden="true" />
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
        {m.auth_userProfile_passkeys_add({}, { locale })}
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

function parseUserAgent(ua: string | null | undefined, locale: SupportedLocale): string {
  if (!ua) return m.auth_userProfile_devices_unknownDevice({}, { locale })

  let browser: string = m.auth_userProfile_devices_unknownBrowser({}, { locale })
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

  return os ? m.auth_userProfile_devices_browserOnOs({ browser, os }, { locale }) : browser
}

const DevicesSubsection: FC<{ currentSessionToken?: string; headingAs: HeadingTag }> = ({
  currentSessionToken,
  headingAs: Heading,
}) => {
  const locale = useLocale()
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
      toast.success(m.auth_userProfile_devices_revoked({}, { locale }))
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    } catch (e: unknown) {
      toast.error(m.auth_userProfile_devices_error({ error: formatErrorMessage(e) }, { locale }))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={confirmRevoke.open}
        title={m.auth_userProfile_devices_confirmRevokeTitle({}, { locale })}
        description={m.auth_userProfile_devices_confirmRevokeDescription({}, { locale })}
        confirmLabel={m.auth_userProfile_devices_confirmRevokeButton({}, { locale })}
        cancelLabel={m.auth_userProfile_confirmCancel({}, { locale })}
        onConfirm={confirmRevoke.onConfirm}
        onCancel={confirmRevoke.onCancel}
      />

      <div className="flex items-center gap-2">
        <IconMdiDevices className="text-lg text-fg-2" aria-hidden="true" />
        <Heading className="text-base font-semibold text-fg-1 m-0">
          {m.auth_userProfile_devices_title({}, { locale })}
        </Heading>
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
              <div key={session.id} className="glass-inset flex items-center gap-3 py-2 px-3">
                <IconMdiDevices className="text-lg text-fg-2 shrink-0" aria-hidden="true" />
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-fg-1 truncate">
                      {parseUserAgent(session.userAgent, locale)}
                    </span>
                    {isCurrent && (
                      <Chip
                        label={m.auth_userProfile_devices_current({}, { locale })}
                        size="small"
                        color="success"
                        variant="outlined"
                        className="!h-5 !text-xs"
                      />
                    )}
                  </div>
                  <span className="text-xs text-fg-2 num">
                    {session.ipAddress || m.auth_userProfile_devices_unknownIp({}, { locale })}
                  </span>
                </div>
                {!isCurrent && (
                  <Button
                    size="small"
                    onClick={() => handleRevoke(session.token)}
                    variant="text"
                    className="!text-xs !shrink-0"
                  >
                    {m.auth_userProfile_devices_revoke({}, { locale })}
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

export const SecuritySection: FC<{
  currentSessionToken?: string
  idPrefix?: string
  /** `h1` as a page (/account/security); `h3` inside the account dialog, under its `h2` title */
  titleAs?: 'h1' | 'h3'
}> = ({ currentSessionToken, idPrefix = 'security', titleAs: Title = 'h1' }) => {
  const locale = useLocale()
  const subheading: HeadingTag = Title === 'h1' ? 'h2' : 'h4'

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Title className="text-lg font-semibold leading-snug text-fg-1 m-0">
          {m.auth_userProfile_security({}, { locale })}
        </Title>
      </div>

      <PasswordSubsection idPrefix={idPrefix} headingAs={subheading} />

      <div className="h-px bg-black/8" aria-hidden="true" />

      <PasskeysSubsection headingAs={subheading} />

      <div className="h-px bg-black/8" aria-hidden="true" />

      <DevicesSubsection currentSessionToken={currentSessionToken} headingAs={subheading} />
    </div>
  )
}