import { useQuery } from '@tanstack/react-query'
import { adminOrpc } from './api'

/** The admin shell (gekichumai/meta#50 L2). English only (meta#50 Q6). Tools are added here layer by layer. */
export function App() {
  const me = useQuery(adminOrpc.me.queryOptions({ retry: false }))

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-sky-100 text-zinc-900 dark:from-zinc-950 dark:to-slate-900 dark:text-zinc-100">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <h1 className="m-0 text-lg font-semibold">DXRating Admin</h1>
        {me.data && (
          <p className="m-0 truncate text-sm text-muted" title={me.data.actor}>
            {me.data.id}
          </p>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-12">
        {me.isPending && <div className="surface h-24 animate-pulse" aria-busy="true" aria-label="Loading" />}
        {me.isError && (
          <section className="surface p-5" role="alert">
            <h2 className="m-0 text-base font-semibold">No access</h2>
            <p className="mb-0 mt-2 text-sm text-muted">
              This account is not an administrator, or the sign-in has expired. Reload to sign in again.
            </p>
          </section>
        )}
        {me.data && (
          <section className="surface p-5">
            <h2 className="m-0 text-base font-semibold">Signed in</h2>
            <dl className="mb-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Principal</dt>
              <dd className="m-0 font-mono">{me.data.actor}</dd>
              <dt className="text-muted">Scopes</dt>
              <dd className="m-0 font-mono">{me.data.scopes.join(', ')}</dd>
            </dl>
            <p className="mb-0 mt-4 text-sm text-muted">Admin tools appear here as they ship.</p>
          </section>
        )}
      </main>
    </div>
  )
}