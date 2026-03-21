import { useCallback, useState } from 'react'
import { Dialog, DialogContent } from '@mui/material'
import { authClient } from '../lib/auth-client'
import { LoginForm } from '../components/auth/LoginForm'

interface EnsureAuthenticatedOptions {
  throwOnError?: boolean
}

export const useAuth = () => {
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [authPending, setAuthPending] = useState(false)
  const { data: sessionData } = authClient.useSession()
  const session = sessionData?.session

  const openLoginDialog = () => setIsLoginDialogOpen(true)
  const closeLoginDialog = () => setIsLoginDialogOpen(false)
  const handlePendingChange = useCallback((p: boolean) => setAuthPending(p), [])

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

  const LoginDialog = () => (
    <Dialog open={isLoginDialogOpen} onClose={() => !authPending && closeLoginDialog()} maxWidth="xs" fullWidth>
      <DialogContent>
        <LoginForm onPendingChange={handlePendingChange} />
      </DialogContent>
    </Dialog>
  )

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