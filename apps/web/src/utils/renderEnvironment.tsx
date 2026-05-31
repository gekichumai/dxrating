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

  const record = context as Record<string, unknown>
  return normalizeRenderedAt(record.renderedAt) ?? readRenderedAtFromContext(record.serverContext)
}

function readRenderedAtFromDocument() {
  if (typeof document === 'undefined') return null

  return normalizeRenderedAt(document.querySelector(`meta[name="${RENDERED_AT_META_NAME}"]`)?.getAttribute('content'))
}

export function resolveRenderedAt(matches?: readonly RouteContextMatch[]) {
  for (const match of [...(matches ?? [])].reverse()) {
    const renderedAt = readRenderedAtFromContext(match.context)
    if (renderedAt) return renderedAt
  }

  return readRenderedAtFromDocument() ?? Date.now()
}

export function RenderEnvironmentProvider({ renderedAt, children }: PropsWithChildren<RenderEnvironment>) {
  return <RenderEnvironmentContext.Provider value={{ renderedAt }}>{children}</RenderEnvironmentContext.Provider>
}

export function useRenderedAt() {
  return useContext(RenderEnvironmentContext).renderedAt || Date.now()
}