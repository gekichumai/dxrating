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
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa, ViewType } from '@supabase/auth-ui-shared'
import clsx from 'clsx'
import { FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAsync, useAsyncFn } from 'react-use'
import { useSWRConfig } from 'swr'
import MdiAccountCheck from '~icons/mdi/account-check'
import MdiAccountKey from '~icons/mdi/account-key'
import MdiLogin from '~icons/mdi/login'
import MdiLogout from '~icons/mdi/logout'
import { useAuth } from '../../../models/context/AuthContext'
import { supabase } from '../../../models/supabase'
import { isBuildPlatformApp } from '../../../utils/env'
import { useVersionTheme } from '../../../utils/useVersionTheme'
import { Logo } from '../Logo'
import { ResponsiveDialog } from '../ResponsiveDialog'

const ThemedAuth: FC<{
  view?: ViewType
}> = ({ view = 'sign_in' }) => {
  const theme = useVersionTheme()
  return (
    <Auth
      supabaseClient={supabase}
      appearance={{
        theme: ThemeSupa,
        variables: {
          default: {
            fontSizes: {
              baseBodySize: '16px',
              baseButtonSize: '16px',
              baseInputSize: '16px',
            },
            fonts: {
              bodyFontFamily: 'Torus, system-ui, Avenir, Helvetica, Arial, sans-serif',
              buttonFontFamily: 'Torus, system-ui, Avenir, Helvetica, Arial, sans-serif',
              inputFontFamily: 'Torus, system-ui, Avenir, Helvetica, Arial, sans-serif',
              labelFontFamily: 'Torus, system-ui, Avenir, Helvetica, Arial, sans-serif',
            },
            radii: {
              borderRadiusButton: '12px',
              buttonBorderRadius: '12px',
              inputBorderRadius: '12px',
            },
            colors: {
              brand: theme.accentColor + '99',
              brandAccent: theme.accentColor,
              brandButtonText: 'black',
            },
            borderWidths: {
              inputBorderWidth: '2px',
            },
          },
        },
      }}
      providers={['github', 'google']}
      magicLink
      view={view}
    />
  )
}

async function sha256(message: string) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message)

  // hash the message
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)

  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer))

  // convert bytes to hex string
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

const Profile: FC<{
  id: string
  email: string
  displayName?: string
}> = ({ id, email, displayName }) => {
  return (
    <div className="flex items-center gap-4 px-4">
      <ProfileImage email={email} />
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
  size?: string
}> = ({ email, size = '2rem' }) => {
  const gravatarEmailHash = useAsync(async () => {
    const e = email?.trim().toLowerCase()
    if (!e) return ''
    return await sha256(e)
  }, [email])

  return gravatarEmailHash.loading ? (
    <div
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <MdiAccountCheck />
    </div>
  ) : (
    <img
      src={`https://gravatar.com/avatar/${gravatarEmailHash.value}?s=48&d=identicon`}
      srcSet={`https://gravatar.com/avatar/${gravatarEmailHash.value}?s=96&d=identicon 2x`}
      alt="Gravatar"
      className="shrink-0 rounded-full bg-gray-4 shadow"
      style={{
        width: size,
        height: size,
      }}
    />
  )
}

export const UpdatePasswordMenuItem: FC = () => {
  const { t } = useTranslation(['auth'])
  const [open, setOpen] = useState(false)
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
          <ThemedAuth view="update_password" />
        </DialogContent>
      </Dialog>

      <MenuItem
        onClick={() => {
          setOpen(true)
        }}
      >
        <ListItemIcon>
          <MdiAccountKey />
        </ListItemIcon>
        <ListItemText>{t('auth:update-password.label')}</ListItemText>
      </MenuItem>
    </>
  )
}

export const UpdateDisplayNameMenuItem: FC = () => {
  const { t } = useTranslation(['auth'])
  const [open, setOpen] = useState(false)
  const { mutate } = useSWRConfig()
  const { session, profile } = useAuth()
  const [displayName, setDisplayName] = useState(() => profile?.display_name ?? '')

  const [updateState, handleUpdate] = useAsyncFn(async () => {
    if (!session) {
      toast.error('You must be signed in to update your display name.')
      return
    }

    await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        display_name: displayName,
      })
      .then((res) => {
        if (res.error) {
          toast.error(`Failed to update your profile name: ${res.error.message}`)
          return
        }
        mutate('supabase::profile::' + session.user.id)
        toast.success('Your profile name has been successfully updated to "' + displayName + '".')
        setOpen(false)
      })
  }, [displayName, session])

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
              disabled={displayName === profile?.display_name || displayName.trim() === ''}
              variant="contained"
              className="h-10"
            >
              {updateState.loading ? (
                <CircularProgress size="1.25rem" className="my-1" />
              ) : (
                'Submit'
              )}
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
  const { session, profile, pending } = useAuth()
  const [profileMenuAnchorEl, setProfileMenuAnchorEl] = useState<HTMLElement | null>(null)

  const logout = async () => {
    await supabase.auth.signOut()
    toast.success(t('auth:logout.toast-success'), {
      id: 'logout-success',
    })
  }

  return (
    <>
      <ResponsiveDialog
        open={open === 'auth'}
        setOpen={(opened) => setOpen(opened ? 'auth' : null)}
      >
        {() => (
          <>
            <div className="flex flex-col items-start justify-center gap-1">
              <Logo />
              <span className="text-sm text-zinc-5">Authentication</span>
              <div className="h-px w-full bg-gray-2 mb-1.5 mt-4" />
            </div>
            <ThemedAuth />
          </>
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
        {session && (
          <Profile
            id={session.user.id}
            email={session.user.email ?? '(no email)'}
            displayName={profile?.display_name}
          />
        )}
        <UpdateDisplayNameMenuItem />
        <UpdatePasswordMenuItem />
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
            {session ? <ProfileImage email={session.user.email} size="1.2em" /> : <MdiLogin />}
          </IconButton>
        )
      )}
    </>
  )
}
