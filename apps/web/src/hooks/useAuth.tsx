import { type FC, useCallback, useState, useSyncExternalStore } from 'react'
import { Dialog, DialogContent } from '@mui/material'
import { authClient } from '../lib/auth-client'
import { LoginForm } from '../components/auth/LoginForm'

interface EnsureAuthenticatedOptions {
  throwOnError?: boolean
}

/** The login dialog's open state, held outside React state so the dialog component can keep one identity */
const createDialogOpenStore = () => {
  let open = false
  const listeners = new Set<() => void>()
  return {
    get: () => open,
    set: (next: boolean) => {
      if (open === next) return
      open = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

type DialogOpenStore = ReturnType<typeof createDialogOpenStore>

const getServerOpen = () => false

const AuthLoginDialog: FC<{ store: DialogOpenStore }> = ({ store }) => {
  const open = useSyncExternalStore(store.subscribe, store.get, getServerOpen)
  const [authPending, setAuthPending] = useState(false)
  const close = useCallback(() => store.set(false), [store])

  return (
    <Dialog open={open} onClose={() => !authPending && close()} maxWidth="xs" fullWidth>
      <DialogContent>
        <LoginForm idPrefix="global-auth-dialog" onPendingChange={setAuthPending} onSuccess={close} />
      </DialogContent>
    </Dialog>
  )
}

export const useAuth = () => {
  const [dialogStore] = useState(createDialogOpenStore)
  const { data: sessionData } = authClient.useSession()
  const session = sessionData?.session

  const openLoginDialog = useCallback(() => dialogStore.set(true), [dialogStore])
  const closeLoginDialog = useCallback(() => dialogStore.set(false), [dialogStore])

  // One component type for the hook's lifetime. A component created on each render is a new type to React, so every
  // re-render of the host (such as the form reporting a pending sign-in) would remount the dialog and the form in it:
  // the remounted form starts a new passkey autofill request, which cancels the passkey prompt the user is answering.
  const [LoginDialog] = useState<FC>(
    () =>
      function LoginDialog() {
        return <AuthLoginDialog store={dialogStore} />
      },
  )

  /**
   * Ensures the user is authenticated before proceeding.
   * If not authenticated, shows a login dialog.
   *
   * @param options.throwOnError - If true, throws an error when user is not authenticated. Default: false
   * @returns Promise that resolves to true if authenticated, false otherwise
   */
  const ensureAuthenticated = async (options: EnsureAuthenticatedOptions = {}): Promise<boolean> => {
    const { throwOnError = false } = options

    if (session) {
      return true
    }

    if (throwOnError) {
      throw new Error('Authentication required')
    }

    openLoginDialog()
    return false
  }

  return {
    session,
    user: sessionData?.user,
    isAuthenticated: !!session,
    ensureAuthenticated,
    openLoginDialog,
    closeLoginDialog,
    LoginDialog,
  }
}