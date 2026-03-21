import { Button, CircularProgress, Skeleton, TextField } from '@mui/material'
import { type FC, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import { authClient } from '../../../lib/auth-client'
import { ProfileImage } from './UserChip'

export const ProfileSection: FC = () => {
  const { t } = useTranslation(['auth'])
  const { data: sessionData, isPending } = authClient.useSession()
  const user = sessionData?.user
  const [displayName, setDisplayName] = useState(() => user?.name ?? '')
  const [initialized, setInitialized] = useState(false)

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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold m-0">{t('auth:user-profile.profile')}</h1>
      </div>

      {/* Profile row */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-700 pb-6">
          <ProfileImage email={user?.email} image={user?.image} size="4rem" />
          <div className="flex flex-col gap-0.5">
            <div className="text-base font-semibold">{user?.name || user?.email}</div>
          </div>
        </div>

        {/* Display name */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {t('auth:user-profile.display-name')}
          </label>
          {isPending ? (
            <Skeleton variant="rounded" height={40} />
          ) : (
            <div className="flex gap-3 items-start">
              <TextField value={displayName} onChange={(e) => setDisplayName(e.target.value)} size="small" fullWidth />
              <Button
                onClick={handleUpdate}
                disabled={displayName === user?.name || displayName.trim() === '' || updateState.loading}
                variant="contained"
                className="!h-10 !shrink-0"
              >
                {updateState.loading ? <CircularProgress size="1.25rem" /> : t('auth:user-profile.save')}
              </Button>
            </div>
          )}
        </div>

        {/* Email */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{t('auth:user-profile.email')}</label>
          {isPending ? (
            <Skeleton variant="rounded" height={40} />
          ) : (
            <TextField value={user?.email ?? ''} size="small" fullWidth disabled />
          )}
        </div>
      </div>
    </div>
  )
}