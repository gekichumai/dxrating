import { CircularProgress } from '@mui/material'
import { createFileRoute } from '@tanstack/react-router'
import { LoginForm } from '@/components/auth/LoginForm'
import { SecuritySection } from '@/components/global/preferences/SecuritySection'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/account/security')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://dxrating.net/account/security' }],
  }),
  component: AccountSecurityPage,
})

function AccountSecurityPage() {
  const { data: sessionData, isPending } = authClient.useSession()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 sm:px-6">
      <section className="min-h-80 rounded-xl bg-white/95 p-6 shadow-lg backdrop-blur-sm dark:bg-zinc-900/95 sm:p-8">
        {isPending ? (
          <div className="flex min-h-64 items-center justify-center" aria-busy="true">
            <CircularProgress size="2rem" />
          </div>
        ) : sessionData?.session ? (
          <SecuritySection currentSessionToken={sessionData.session.token} />
        ) : (
          <div className="mx-auto max-w-sm p-4">
            <LoginForm />
          </div>
        )}
      </section>
    </main>
  )
}