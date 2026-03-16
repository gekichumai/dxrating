import { Alert, Button, CircularProgress, Divider, TextField } from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWebHaptics } from 'web-haptics/react'
import toast from 'react-hot-toast'
import IconMdiFingerprint from '~icons/mdi/fingerprint'
import IconLogosGithub from '~icons/logos/github-icon'
import IconLogosGoogle from '~icons/logos/google-icon'
import { authClient } from '../../lib/auth-client'

export const LoginForm = () => {
  const { t } = useTranslation(['auth'])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const haptic = useWebHaptics()
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: email.split('@')[0], // Default name
        })
        if (error) throw error
        haptic.trigger('success')
        toast.success(t('auth:sign-up.toast-success'))
        setIsSignUp(false)
      } else {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw error
        haptic.trigger('success')
        toast.success(t('auth:login.toast-success'))
      }
    } catch (e: any) {
      haptic.trigger('error')
      setError(e.message || t('auth:form.error-generic'))
    } finally {
      setLoading(false)
    }
  }

  const handleSocial = async (provider: 'google' | 'github') => {
    setLoading(true)
    await authClient.signIn.social({
      provider,
      callbackURL: window.location.href,
    })
    // No setLoading(false) because it redirects
  }

  const handlePasskey = async () => {
    setLoading(true)
    try {
      const { error } = await authClient.signIn.passkey()
      if (error) throw error
      haptic.trigger('success')
      toast.success(t('auth:login.toast-success'))
    } catch (e: any) {
      haptic.trigger('error')
      setError(e.message || t('auth:form.error-passkey'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="text-center mb-1">
        <div className="text-xl font-bold">{isSignUp ? t('auth:sign-up.title') : t('auth:form.title')}</div>
        <div className="text-sm text-zinc-500 mt-1">{t('auth:form.subtitle')}</div>
      </div>

      {error && <Alert severity="error">{error}</Alert>}

      <div className="flex flex-col gap-2">
        <Button
          variant="outlined"
          startIcon={<IconLogosGithub className="w-5 h-5" />}
          onClick={() => handleSocial('github')}
          disabled={loading}
          className="!py-2.5 !text-sm !normal-case"
          fullWidth
        >
          {t('auth:form.continue-with-github')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<IconLogosGoogle className="w-5 h-5" />}
          onClick={() => handleSocial('google')}
          disabled={loading}
          className="!py-2.5 !text-sm !normal-case"
          fullWidth
        >
          {t('auth:form.continue-with-google')}
        </Button>
      </div>

      <Divider className="!my-1">
        <span className="text-xs text-zinc-400">{t('auth:form.or')}</span>
      </Divider>

      <div className="flex flex-col gap-2">
        <TextField
          label={t('auth:form.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          size="small"
        />
        <TextField
          label={t('auth:form.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          size="small"
        />
      </div>

      <Button variant="contained" onClick={handleSubmit} disabled={loading} className="!py-2.5" fullWidth>
        {loading ? <CircularProgress size={20} /> : isSignUp ? t('auth:sign-up.label') : t('auth:form.continue')}
      </Button>

      <Button
        variant="outlined"
        startIcon={<IconMdiFingerprint className="text-lg" />}
        onClick={handlePasskey}
        disabled={loading}
        className="!py-2 !text-sm !normal-case"
        fullWidth
      >
        {t('auth:form.sign-in-with-passkey')}
      </Button>

      <div className="text-center text-sm text-zinc-500 mt-1">
        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-blue-600 hover:underline cursor-pointer bg-transparent border-none text-sm"
        >
          {isSignUp ? t('auth:form.has-account') : t('auth:form.no-account')}
        </button>
      </div>
    </div>
  )
}