import { createContext, type PropsWithChildren, useContext } from 'react'

export const RENDERED_AT_META_NAME = 'dxrating-rendered-at'

type RenderEnvironment = {
  renderedAt: number
}

type RouteContextMatch = {
  context?: unknown
}

const RenderEnvironmentContext = createContext<RenderEnvironment>({ renderedAt: 0 })

function normalizeRenderedAt(value: unknown) {
  const timestamp = typeof value === 'string' ? Number(value) : value
  return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

function readRenderedAtFromContext(context: unknown): number | null {
  if (typeof context !== 'object' || context === null) return null

  return (
    normalizeRenderedAt('renderedAt' in context ? context.renderedAt : undefined) ??
    readRenderedAtFromContext('serverContext' in context ? context.serverContext : undefined)
  )
}

function readRenderedAtFromDocument() {
  if (typeof document === 'undefined') return null

  return normalizeRenderedAt(document.querySelector(`meta[name="${RENDERED_AT_META_NAME}"]`)?.getAttribute('content'))
}

export function resolveRenderedAt(matches?: readonly RouteContextMatch[]) {
  for (const match of [...(matches ?? [])].toReversed()) {
    const renderedAt = readRenderedAtFromContext(match.context)
    if (renderedAt !== null) return renderedAt
  }

  return readRenderedAtFromDocument() ?? Date.now()
}

export function RenderEnvironmentProvider({ renderedAt, children }: PropsWithChildren<RenderEnvironment>) {
  return <RenderEnvironmentContext.Provider value={{ renderedAt }}>{children}</RenderEnvironmentContext.Provider>
}

export function useRenderedAt() {
  const { renderedAt } = useContext(RenderEnvironmentContext)
  return renderedAt !== 0 && !Number.isNaN(renderedAt) ? renderedAt : Date.now()
}