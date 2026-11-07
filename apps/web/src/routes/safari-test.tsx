/**
 * TEMPORARY diagnostic page for the iOS Safari toolbar tint (dxrating#568). Lives only on a never-merged draft PR's
 * preview deployment. Not translated on purpose: it's a test page for the owner, not product UI.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type Variant = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
type ThemeOverride = 'light' | 'dark' | undefined

const VARIANTS: Record<Variant, string> = {
  A: 'Current production (nothing changed)',
  B: 'Fix PR #568: dark canvas = pastel seen through the scrim',
  C: 'B + html background + fixed backdrop that overhangs both edges by 50lvh',
  D: 'B + theme-color meta removed',
  E: 'PROBE: fixed ORANGE strip at the top edge, BLUE strip at the bottom edge',
  F: 'PROBE: html and body background MAGENTA (no strips)',
}

const CANVAS = `
html { --sft-canvas: var(--theme-canvas); }
html[data-theme='dark'] { --sft-canvas: color-mix(in srgb, rgb(12 12 15) 74%, var(--theme-canvas)); }`

const CSS: Record<Variant, string> = {
  A: '',
  B: `${CANVAS}
html[data-theme='dark'] body { background-color: var(--sft-canvas) !important; }`,
  C: `${CANVAS}
html { background-color: var(--sft-canvas) !important; }
html[data-theme='dark'] body { background-color: var(--sft-canvas) !important; }
.sft-bleed { position: fixed; left: 0; right: 0; top: -50lvh; bottom: -50lvh; z-index: -3; pointer-events: none; background: var(--sft-canvas); }`,
  D: `${CANVAS}
html[data-theme='dark'] body { background-color: var(--sft-canvas) !important; }`,
  E: `.sft-strip { position: fixed; left: 0; right: 0; z-index: 2000; pointer-events: none; }
.sft-strip--top { top: 0; height: calc(env(safe-area-inset-top) + 40px); background: #ff8a00; }
.sft-strip--bottom { bottom: 0; height: calc(env(safe-area-inset-bottom) + 40px); background: #0066ff; }`,
  F: `html, html body, html[data-theme='dark'] body { background-color: #ff00ff !important; }`,
}

function parseVariant(value: unknown): Variant {
  return typeof value === 'string' && value.toUpperCase() in VARIANTS ? (value.toUpperCase() as Variant) : 'A'
}

export const Route = createFileRoute('/safari-test')({
  ssr: true,
  validateSearch: (search: Record<string, unknown>): { v: Variant; t?: ThemeOverride } => ({
    v: parseVariant(search.v),
    t: search.t === 'light' || search.t === 'dark' ? search.t : undefined,
  }),
  head: () => ({ meta: [{ title: 'Safari bar test' }, { name: 'robots', content: 'noindex' }] }),
  component: SafariTestPage,
})

type Readout = Record<string, string>

function measure(): Readout {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;width:0;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);' +
    'padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)'
  document.body.appendChild(probe)
  const ps = getComputedStyle(probe)
  const unit = (u: string) => {
    probe.style.height = `100${u}`
    probe.style.paddingTop = '0'
    probe.style.paddingBottom = '0'
    return `${Math.round(probe.getBoundingClientRect().height)}px`
  }
  const insets = `${ps.paddingTop} / ${ps.paddingBottom} (L ${ps.paddingLeft}, R ${ps.paddingRight})`
  const svh = unit('svh')
  const lvh = unit('lvh')
  const dvh = unit('dvh')
  probe.remove()
  const vv = window.visualViewport
  const html = document.documentElement
  return {
    'env(safe-area-inset top / bottom)': insets,
    innerHeight: `${window.innerHeight}px`,
    'visualViewport height / offsetTop': vv ? `${Math.round(vv.height)}px / ${Math.round(vv.offsetTop)}px` : 'n/a',
    '100svh / 100lvh / 100dvh': `${svh} / ${lvh} / ${dvh}`,
    scrollY: `${Math.round(window.scrollY)}px`,
    'prefers-color-scheme: dark': String(matchMedia('(prefers-color-scheme: dark)').matches),
    'html data-theme': html.getAttribute('data-theme') ?? '(none)',
    'html background': getComputedStyle(html).backgroundColor,
    'body background': getComputedStyle(document.body).backgroundColor,
    'theme-color meta':
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? '(removed)',
    userAgent: navigator.userAgent,
  }
}

function SafariTestPage() {
  const { v, t } = Route.useSearch()
  const [readout, setReadout] = useState<Readout>({})

  // Force the theme for this visit only (not stored), so light/dark can be tested without changing settings
  useEffect(() => {
    if (!t) return
    const html = document.documentElement
    const previous = html.getAttribute('data-theme')
    html.setAttribute('data-theme', t)
    return () => {
      if (previous) html.setAttribute('data-theme', previous)
    }
  }, [t])

  // Variant D: take the theme-color meta out while on this page
  useEffect(() => {
    if (v !== 'D') return
    const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) return
    const parent = meta.parentNode
    meta.remove()
    return () => {
      parent?.appendChild(meta)
    }
  }, [v])

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setReadout(measure()))
    }
    update()
    const timer = window.setInterval(update, 1000)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [v, t])

  const href = (variant: Variant, theme: ThemeOverride) => `/safari-test?v=${variant}${theme ? `&t=${theme}` : ''}`

  return (
    <main className="page-gutter mx-auto max-w-xl py-4 text-[15px] leading-snug">
      {CSS[v] && <style>{CSS[v]}</style>}
      {v === 'C' && <div className="sft-bleed" aria-hidden />}
      {v === 'E' && (
        <>
          <div className="sft-strip sft-strip--top" aria-hidden />
          <div className="sft-strip sft-strip--bottom" aria-hidden />
        </>
      )}

      <div className="rounded-lg bg-white/85 p-3 text-zinc-900 shadow">
        <h1 className="m-0 text-lg font-bold">
          Variant {v} · theme {t ?? 'your setting'}
        </h1>
        <p className="m-0 mt-1 text-sm">{VARIANTS[v]}</p>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-sm">
          {(Object.keys(VARIANTS) as Variant[]).flatMap((variant) =>
            (['light', 'dark'] as const).map((theme) => (
              <a
                key={variant + theme}
                href={href(variant, theme)}
                className={`rounded bg-zinc-200 px-2 py-1.5 text-center font-semibold text-zinc-900 no-underline ${
                  variant === v && theme === t ? 'outline outline-2 outline-[#ff8a00]' : ''
                }`}
              >
                {variant} {theme}
              </a>
            )),
          )}
        </div>

        <dl className="m-0 mt-3 font-mono text-[12px]">
          {Object.entries(readout).map(([key, value]) => (
            <div key={key} className="border-t border-zinc-300 py-1">
              <dt className="text-zinc-500">{key}</dt>
              <dd className="m-0 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ol className="mt-4 rounded-lg bg-white/85 p-3 pl-8 text-zinc-900 shadow">
        <li>Screenshot at the very top (toolbar expanded).</li>
        <li>Scroll down until Safari collapses its toolbar, then screenshot.</li>
        <li>Pull past the top (overscroll) and screenshot while holding.</li>
        <li>Repeat for each button above.</li>
      </ol>

      {Array.from({ length: 30 }, (_, i) => (
        <p key={i} className="mt-6 rounded-lg bg-white/60 p-3 text-zinc-700">
          Filler block {i + 1} so the page scrolls and Safari collapses its toolbar.
        </p>
      ))}
    </main>
  )
}