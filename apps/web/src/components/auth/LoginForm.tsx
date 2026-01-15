
import { Alert, Box, Button, CircularProgress, Divider, TextField, Typography } from "@mui/material"
import { useState } from "react"
import toast from "react-hot-toast"
import IconMdiFingerprint from "~icons/mdi/fingerprint"
import MdiGithub from "~icons/mdi/github"
import MdiGoogle from "~icons/mdi/google"
import { authClient } from "../../lib/auth-client"

export const LoginForm = () => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
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
                name: email.split('@')[0] // Default name
            })
            if (error) throw error
            toast.success("Account created! You can now sign in.")
            setIsSignUp(false)
        } else {
            const { error } = await authClient.signIn.email({ email, password })
            if (error) throw error
            toast.success("Signed in successfully!")
        }
    } catch (e: any) {
        setError(e.message || "An error occurred")
    } finally {
        setLoading(false)
    }
  }

  const handleSocial = async (provider: 'google' | 'github') => {
      setLoading(true)
      await authClient.signIn.social({
          provider
      })
      // No setLoading(false) because it redirects
  }

  const handlePasskey = async () => {
    setLoading(true)
    try {
      const { error } = await authClient.signIn.passkey()
      if (error) throw error
      toast.success("Signed in with Passkey!")
    } catch (e: any) {
      setError(e.message || "Failed to sign in with Passkey")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box className="flex flex-col gap-4 w-full p-4">
      <Typography variant="h6">{isSignUp ? "Sign Up" : "Sign In"}</Typography>
      
      {error && <Alert severity="error">{error}</Alert>}

      <TextField 
        label="Email" 
        value={email} 
        onChange={e => setEmail(e.target.value)} 
        fullWidth 
      />
      <TextField 
        label="Password" 
        type="password" 
        value={password} 
        onChange={e => setPassword(e.target.value)} 
        fullWidth 
      />

      <Button variant="contained" onClick={handleSubmit} disabled={loading}>
        {loading ? <CircularProgress size={24} /> : (isSignUp ? "Sign Up" : "Sign In")}
      </Button>

      <Button onClick={() => setIsSignUp(!isSignUp)}>
        {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
      </Button>

      <Divider>OR</Divider>

      <Button 
        variant="outlined" 
        startIcon={<MdiGoogle />} 
        onClick={() => handleSocial('google')}
      >
        Continue with Google
      </Button>
      <Button 
        variant="outlined" 
        startIcon={<MdiGithub />} 
        onClick={() => handleSocial('github')}
      >
        Continue with GitHub
      </Button>

      <Button
        variant="outlined"
        startIcon={<IconMdiFingerprint />}
        onClick={handlePasskey}
      >
        Sign in with Passkey
      </Button>
    </Box>
  )
}
