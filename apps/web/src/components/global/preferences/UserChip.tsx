import {
    Button,
    CircularProgress,
    Dialog,
    DialogContent,
    Grow,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    TextField,
} from '@mui/material'
import clsx from 'clsx'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAsync, useAsyncFn } from 'react-use'
import MdiAccountCheck from '~icons/mdi/account-check'
import MdiLogin from '~icons/mdi/login'
import MdiLogout from '~icons/mdi/logout'
import { authClient } from '../../../lib/auth-client'
import { isBuildPlatformApp } from '../../../utils/env'
import { LoginForm } from '../../auth/LoginForm'
import { Logo } from '../Logo'
import { ResponsiveDialog } from '../ResponsiveDialog'

async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

const Profile: FC<{
  id: string
  email: string
  displayName?: string | null
  image?: string | null
}> = ({ id, email, displayName, image }) => {
  return (
    <div className="flex items-center gap-4 px-4">
      <ProfileImage email={email} image={image} />
      <div className="flex flex-col gap-1 mb-2 mt-1">
        <div className={clsx('text-lg font-bold', !displayName && 'text-zinc-500 -skew-x-10')}>
          {displayName ?? email}
        </div>
        <div className="text-xs text-zinc-500 tracking-tighter">
          #<span className="font-mono">{id}</span>
        </div>
      </div>
    </div>
  )
}

const ProfileImage: FC<{
  email?: string
  image?: string | null
  size?: string
}> = ({ email, image, size = '2rem' }) => {
  const gravatarEmailHash = useAsync(async () => {
    const e = email?.trim().toLowerCase()
    if (!e) return ''
    return await sha256(e)
  }, [email])

  const src = image || (gravatarEmailHash.value ? `https://gravatar.com/avatar/${gravatarEmailHash.value}?s=96&d=identicon` : undefined)

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
      alt="Profile"
    />
  )
}

export const UpdateDisplayNameMenuItem: FC = () => {
  const { t } = useTranslation(['auth'])
  const [open, setOpen] = useState(false)
  const { data: sessionData } = authClient.useSession()
  const user = sessionData?.user
  const [displayName, setDisplayName] = useState(() => user?.name ?? '')

  const [updateState, handleUpdate] = useAsyncFn(async () => {
    if (!user) {
      toast.error('You must be signed in to update your display name.')
      return
    }

    const { error } = await authClient.updateUser({
        name: displayName
    })

    if (error) {
        toast.error(`Failed to update profile: ${error.message}`)
        return
    }
    
    toast.success(`Your profile name has been successfully updated to "${displayName}".`)
    setOpen(false)
  }, [displayName, user])

  return (
    <>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        TransitionComponent={Grow}
        maxWidth="md"
        classes={{
          paper: 'w-full',
        }}
      >
        <DialogContent>
          <div className="flex flex-col items-start justify-center gap-1">
            <Logo />
            <span className="text-sm text-zinc-5">Profile</span>
            <div className="h-px w-full bg-gray-2 my-4" />
          </div>
          <div className="flex flex-col gap-4">
            <TextField
              label={t('auth:update-display-name.label')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              data-attr="update-display-name"
            />
            <Button
              onClick={handleUpdate}
              disabled={displayName === user?.name || displayName.trim() === ''}
              variant="contained"
              className="h-10"
            >
              {updateState.loading ? <CircularProgress size="1.25rem" className="my-1" /> : 'Submit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MenuItem
        onClick={() => {
          setOpen(true)
        }}
      >
        <ListItemIcon>
          <MdiAccountCheck />
        </ListItemIcon>
        <ListItemText>{t('auth:update-display-name.label')}</ListItemText>
      </MenuItem>
    </>
  )
}

export const UserChip: FC = () => {
  const DISABLE_EXPLICIT_AUTH = isBuildPlatformApp

  const { t } = useTranslation(['auth'])
  const [open, setOpen] = useState<'auth' | 'profile' | null>(null)
  const { data: sessionData, isPending: pending } = authClient.useSession()
  const session = sessionData?.session
  const user = sessionData?.user
  const [profileMenuAnchorEl, setProfileMenuAnchorEl] = useState<HTMLElement | null>(null)

  const logout = async () => {
    await authClient.signOut()
    toast.success(t('auth:logout.toast-success'), {
      id: 'logout-success',
    })
  }

  return (
    <>
      <ResponsiveDialog open={open === 'auth'} setOpen={(opened) => setOpen(opened ? 'auth' : null)}>
        {() => (
           <LoginForm />
        )}
      </ResponsiveDialog>

      <Menu
        anchorEl={profileMenuAnchorEl}
        open={Boolean(profileMenuAnchorEl)}
        onClose={() => {
          setOpen(null)
          setProfileMenuAnchorEl(null)
        }}
      >
        {user && (
          <Profile
            id={user.id}
            email={user.email}
            displayName={user.name}
            image={user.image}
          />
        )}
        <UpdateDisplayNameMenuItem />
        {/* UpdatePasswordMenuItem removed for now, or implement using authClient.changePassword */}
        <MenuItem
          onClick={() => {
            logout()
            setOpen(null)
            setProfileMenuAnchorEl(null)
          }}
          color="error"
        >
          <ListItemIcon>
            <MdiLogout />
          </ListItemIcon>
          <ListItemText>{t('auth:logout.label')}</ListItemText>
        </MenuItem>
      </Menu>

      {!DISABLE_EXPLICIT_AUTH && pending ? (
        <div className="p-2 text-[1.5rem]">
          <div className="h-[1.2em] w-[1.2em] px-[0.1em] -mt-[0.1em] text-black/54">
            <CircularProgress disableShrink size="1em" color="inherit" />
          </div>
        </div>
      ) : (
        (!DISABLE_EXPLICIT_AUTH || session) && (
          <IconButton
            onClick={(e) => {
              setOpen(session ? 'profile' : 'auth')
              if (session) {
                setProfileMenuAnchorEl(e.currentTarget)
              }
            }}
          >
            {session ? <ProfileImage email={user?.email} image={user?.image} size="1.2em" /> : <MdiLogin />}
          </IconButton>
        )
      )}
    </>
  )
}
