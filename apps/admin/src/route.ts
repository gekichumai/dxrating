import { useEffect, useState } from 'react'

/**
 * The admin's views, addressed by the URL hash (`#publications?channel=…`), so a view and its parameters survive a
 * reload and can be linked. The hash keeps the Worker's SPA fallback out of it.
 */
export const VIEWS = ['overview', 'announcements', 'publications'] as const
export type View = (typeof VIEWS)[number]

export interface Route {
  view: View
  params: URLSearchParams
}

export const parseRoute = (hash: string): Route => {
  const [name = '', query = ''] = hash.replace(/^#/, '').split('?', 2)
  const view = (VIEWS as readonly string[]).includes(name) ? (name as View) : 'overview'
  return { view, params: new URLSearchParams(query) }
}

export const routeHref = (view: View, params: Record<string, string | number | undefined> = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  ).toString()
  return `#${view}${query ? `?${query}` : ''}`
}

export const useRoute = (): Route => {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseRoute(hash)
}