import { useQuery } from '@tanstack/react-query'
import { NotFoundContent } from '@/components/global/NotFoundContent'
import { orpc } from '@/lib/orpc'

/**
 * The admin home (gekichumai/meta#50). English only for now (meta#50 Q6). Anyone the backend does not confirm as an
 * administrator sees the ordinary 404, so the page does not reveal that it exists.
 */
export function AdminHomePage() {
  const me = useQuery(orpc.admin.me.queryOptions({ retry: false, staleTime: 60_000 }))

  if (me.isPending) return <div className="page-gutter min-h-80 py-12" aria-busy="true" />
  if (me.isError) return <NotFoundContent />

  return (
    <div className="page-gutter flex flex-col gap-4 py-8">
      <h1 className="page-title m-0">Admin</h1>
      <section className="glass flex flex-col gap-2 px-5 py-4">
        <p className="m-0 text-sm text-fg-2">
          Signed in as administrator <code className="num">{me.data.userId}</code>
        </p>
        <p className="m-0 text-sm text-fg-2">Admin tools will appear here as they ship.</p>
      </section>
    </div>
  )
}