import { type FC, useCallback, useState } from 'react'
import { Dialog, DialogContent } from '@mui/material'
import { authClient } from '../lib/auth-client'
import { LoginForm } from '../components/auth/LoginForm'

interface EnsureAuthenticatedOptions {
  throwOnError?: boolean
}

const AuthLoginDialog: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [authPending, setAuthPending] = useState(false)

  return (
    <Dialog open={open} onClose={() => !authPending && onClose()} maxWidth="xs" fullWidth>
      <DialogContent>
        <LoginForm idPrefix="global-auth-dialog" onPendingChange={setAuthPending} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  )
}

export const useAuth = () => {
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const { data: sessionData } = authClient.useSession()
  const session = sessionData?.session

  const openLoginDialog = useCallback(() => setIsLoginDialogOpen(true), [])
  const closeLoginDialog = useCallback(() => setIsLoginDialogOpen(false), [])

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
    loginDialog: <AuthLoginDialog open={isLoginDialogOpen} onClose={closeLoginDialog} />,
  }
}