import { Button, CircularProgress, Skeleton, TextField } from '@mui/material'
import { type FC, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import { authClient } from '../../../lib/auth-client'
import { ProfileImage } from './UserChip'

export const ProfileSection: FC<{ idPrefix?: string }> = ({ idPrefix = 'profile' }) => {
  const { t } = useTranslation(['auth'])
  const { data: sessionData, isPending } = authClient.useSession()
  const user = sessionData?.user
  const [displayName, setDisplayName] = useState(() => user?.name ?? '')
  const [initialized, setInitialized] = useState(false)
  const [showRequired, setShowRequired] = useState(false)
  const displayNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!initialized && user?.name) {
      setDisplayName(user.name)
      setInitialized(true)
    }
  }, [initialized, user?.name])

  const [updateState, handleUpdate] = useAsyncFn(async () => {
    const { error } = await authClient.updateUser({
      name: displayName,
    })
    if (error) {
      toast.error(t('auth:update-display-name.toast-failed', { error: error.message }))
      return
    }
    toast.success(t('auth:update-display-name.toast-success', { name: displayName }))
  }, [displayName])

  const displayNameId = `${idPrefix}-display-name`
  const emailId = `${idPrefix}-email`
  const displayNameEmpty = displayName.trim() === ''
  const displayNameError = showRequired && displayNameEmpty

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold leading-snug text-fg-1 m-0">{t('auth:user-profile.profile')}</h3>
      </div>

      {/* Profile row */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 border-0 border-b border-solid border-black/8 pb-6">
          <ProfileImage
            email={user?.email}
            image={user?.image}
            size="4rem"
            alt={t('auth:user-profile.avatar-alt', { name: user?.name || user?.email || t('auth:user-profile.title') })}
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="text-base font-semibold text-fg-1 truncate">{user?.name || user?.email}</div>
          </div>
        </div>

        {/* Display name */}
        <form
          className="flex flex-col gap-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (displayNameEmpty) {
              setShowRequired(true)
              displayNameRef.current?.focus()
              return
            }
            if (displayName !== user?.name && !updateState.loading) void handleUpdate()
          }}
        >
          <label htmlFor={displayNameId} className="text-sm font-semibold text-fg-1">
            {t('auth:user-profile.display-name')}
          </label>
          {isPending ? (
            <Skeleton variant="rounded" height={40} />
          ) : (
            <div className="flex gap-3 items-start">
              <TextField
                id={displayNameId}
                inputRef={displayNameRef}
                name="nickname"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (e.target.value.trim() !== '') setShowRequired(false)
                }}
                error={displayNameError}
                helperText={displayNameError ? t('auth:user-profile.display-name-required') : undefined}
                size="small"
                fullWidth
              />
              <Button
                type="submit"
                // Nothing to save until the name changes; an empty name is caught on submit with an inline error
                disabled={displayName === user?.name || updateState.loading}
                aria-busy={updateState.loading || undefined}
                variant="contained"
                className="!h-10 !shrink-0"
              >
                {updateState.loading ? (
                  <CircularProgress size="1.25rem" color="inherit" aria-label={t('auth:user-profile.saving')} />
                ) : (
                  t('auth:user-profile.save')
                )}
              </Button>
            </div>
          )}
        </form>

        {/* Email */}
        <div className="flex flex-col gap-2">
          <label htmlFor={emailId} className="text-sm font-semibold text-fg-1">
            {t('auth:user-profile.email')}
          </label>
          {isPending ? (
            <Skeleton variant="rounded" height={40} />
          ) : (
            <TextField
              id={emailId}
              name="email"
              autoComplete="email"
              type="email"
              value={user?.email ?? ''}
              size="small"
              fullWidth
              // Read-only rather than disabled: the address stays legible and can still be selected and copied
              InputProps={{ readOnly: true }}
            />
          )}
        </div>
      </div>
    </div>
  )
}