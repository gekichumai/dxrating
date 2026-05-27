import { CircularProgress, IconButton } from '@mui/material'
import { lazy, type FC, Suspense, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync } from 'react-use'
import MdiAccountCheck from '~icons/mdi/account-check'
import MdiLogin from '~icons/mdi/login'
import { authClient } from '../../../lib/auth-client'
import { ResponsiveDialog } from '../ResponsiveDialog'

const LoginForm = lazy(() => import('../../auth/LoginForm').then((module) => ({ default: module.LoginForm })))
const UserProfileModal = lazy(() =>
  import('./UserProfileModal').then((module) => ({ default: module.UserProfileModal })),
)

const dialogFallback = (
  <div className="flex items-center justify-center p-8">
    <CircularProgress disableShrink size="1.5rem" />
  </div>
)

async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

export const ProfileImage: FC<{
  email?: string
  image?: string | null
  size?: string
  alt?: string
}> = ({ email, image, size = '2rem', alt = '' }) => {
  const gravatarEmailHash = useAsync(async () => {
    const e = email?.trim().toLowerCase()
    if (!e) return ''
    return await sha256(e)
  }, [email])

  const src =
    image ||
    (gravatarEmailHash.value ? `https://gravatar.com/avatar/${gravatarEmailHash.value}?s=96&d=identicon` : undefined)

  return !src && gravatarEmailHash.loading ? (
    <div className="shrink-0 rounded-full flex items-center justify-center" style={{ width: size, height: size }}>
      <MdiAccountCheck />
    </div>
  ) : (
    <img
      src={src}
      className="shrink-0 rounded-full bg-gray-4 shadow"
      style={{
        width: size,
        height: size,
      }}
      alt={alt}
    />
  )
}

export const UserChip: FC = () => {
  const { t } = useTranslation(['auth'])
  const [open, setOpen] = useState<'auth' | 'profile' | null>(null)
  const [authPending, setAuthPending] = useState(false)
  const { data: sessionData, isPending: pending } = authClient.useSession()
  const session = sessionData?.session
  const user = sessionData?.user
  const handlePendingChange = useCallback((p: boolean) => setAuthPending(p), [])

  return (
    <>
      <ResponsiveDialog
        open={open === 'auth'}
        setOpen={(opened) => setOpen(opened ? 'auth' : null)}
        maxWidth="xs"
        disableClose={authPending}
        drawerHeight="70vh"
      >
        {() => (
          <Suspense fallback={dialogFallback}>
            <LoginForm onPendingChange={handlePendingChange} onSuccess={() => setOpen(null)} />
          </Suspense>
        )}
      </ResponsiveDialog>

      <Suspense fallback={null}>
        {open === 'profile' && <UserProfileModal open={true} onClose={() => setOpen(null)} />}
      </Suspense>

      {pending ? (
        <div className="p-2 text-[1.5rem]">
          <div className="h-[1.2em] w-[1.2em] px-[0.1em] -mt-[0.1em] text-black/54">
            <CircularProgress disableShrink size="1em" color="inherit" />
          </div>
        </div>
      ) : (
        <IconButton
          onClick={() => {
            setOpen(session ? 'profile' : 'auth')
          }}
          aria-label={t(session ? 'auth:user-menu.open-profile' : 'auth:user-menu.sign-in')}
          title={t(session ? 'auth:user-menu.open-profile' : 'auth:user-menu.sign-in')}
        >
          {session ? <ProfileImage email={user?.email} image={user?.image} size="1.2em" /> : <MdiLogin />}
        </IconButton>
      )}
    </>
  )
}
