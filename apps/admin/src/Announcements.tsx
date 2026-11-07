import {
  ANNOUNCEMENT_LOOKAHEAD_MS,
  ANNOUNCEMENT_PLATFORMS,
  ANNOUNCEMENT_REGIONS,
  ANNOUNCEMENT_SEVERITIES,
  SUPPORTED_LOCALES,
} from '@gekichumai/api-contract'
import { ORPCError } from '@orpc/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { adminClient, adminOrpc } from './api'

/**
 * Announcement authoring (gekichumai/meta#49, meta#50 L4b). Preview runs the same validation as Save (dryRun) and shows
 * what each language will read; Save writes and invalidates the public list at the edge.
 */
type Announcement = Awaited<ReturnType<typeof adminClient.announcements.list>>['announcements'][number]
type WriteResult = Awaited<ReturnType<typeof adminClient.announcements.create>>
type Text = Record<string, string>

interface Draft {
  id?: number
  /** The updatedAt this draft was read at; Save is refused (409) if someone saved since */
  updatedAt?: string
  severity: (typeof ANNOUNCEMENT_SEVERITIES)[number]
  title: Text
  body: Text
  linkUrl: string
  linkLabel: Text
  startsAt: string
  endsAt: string
  platforms: string[]
  regions: string[]
  minAppVersion: string
  maxAppVersion: string
  dismissible: boolean
}

const emptyDraft = (): Draft => ({
  severity: 'info',
  title: {},
  body: {},
  linkUrl: '',
  linkLabel: {},
  startsAt: '',
  endsAt: '',
  platforms: [],
  regions: [],
  minAppVersion: '',
  maxAppVersion: '',
  dismissible: true,
})

/** datetime-local works in the browser's zone; the API takes ISO 8601 */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

const draftFrom = (a: Announcement): Draft => ({
  id: a.id,
  updatedAt: a.updatedAt,
  severity: a.severity as Draft['severity'],
  title: a.title,
  body: a.body,
  linkUrl: a.link?.url ?? '',
  linkLabel: a.link?.label ?? {},
  startsAt: toLocalInput(a.startsAt),
  endsAt: toLocalInput(a.endsAt),
  platforms: a.platforms,
  regions: a.regions,
  minAppVersion: a.minAppVersion ?? '',
  maxAppVersion: a.maxAppVersion ?? '',
  dismissible: a.dismissible,
})

export const toInput = (draft: Draft) => ({
  severity: draft.severity,
  title: draft.title,
  body: draft.body,
  link: draft.linkUrl.trim()
    ? {
        url: draft.linkUrl.trim(),
        label: Object.values(draft.linkLabel).some((v) => v.trim()) ? draft.linkLabel : null,
      }
    : null,
  startsAt: fromLocalInput(draft.startsAt),
  endsAt: fromLocalInput(draft.endsAt),
  platforms: draft.platforms as (typeof ANNOUNCEMENT_PLATFORMS)[number][],
  regions: draft.regions as (typeof ANNOUNCEMENT_REGIONS)[number][],
  minAppVersion: draft.minAppVersion.trim() || null,
  maxAppVersion: draft.maxAppVersion.trim() || null,
  dismissible: draft.dismissible,
})

export const statusOf = (a: Pick<Announcement, 'startsAt' | 'endsAt'>, now = Date.now()) =>
  a.endsAt && Date.parse(a.endsAt) <= now ? 'ended' : Date.parse(a.startsAt) > now ? 'scheduled' : 'live'

const errorText = (error: unknown) =>
  error instanceof ORPCError ? `${error.code}: ${error.message}` : 'The request failed. Try again.'

const field =
  'w-full rounded-md border border-black/10 bg-white/80 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-white/5'
const button =
  'rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/10'
const primary =
  'rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50'

export function Announcements({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient()
  const list = useQuery(adminOrpc.announcements.list.queryOptions({ retry: false }))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [result, setResult] = useState<WriteResult | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminOrpc.announcements.list.key() })

  const write = useMutation({
    mutationFn: ({ draft, dryRun }: { draft: Draft; dryRun: boolean }) =>
      draft.id === undefined
        ? adminClient.announcements.create({ announcement: toInput(draft), dryRun })
        : adminClient.announcements.update({
            announcement: { ...toInput(draft), id: draft.id },
            dryRun,
            ifUpdatedAt: draft.updatedAt,
          }),
    onSuccess: (out, { dryRun }) => {
      setResult(out)
      if (!dryRun) {
        setDraft(null)
        void refresh()
      }
    },
  })
  const end = useMutation({
    mutationFn: (id: number) => adminClient.announcements.end({ id }),
    onSuccess: () => void refresh(),
  })
  const endedTitle = end.data?.announcement.title.en

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setResult(null)
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }
  const setText = (key: 'title' | 'body' | 'linkLabel', locale: string, value: string) =>
    set(key, { ...draft![key], [locale]: value })
  const toggle = (key: 'platforms' | 'regions', value: string) =>
    set(key, draft![key].includes(value) ? draft![key].filter((v) => v !== value) : [...draft![key], value])

  return (
    <section className="surface mt-4 p-5" aria-labelledby="announcements-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="announcements-heading" className="m-0 text-base font-semibold">
          Announcements
        </h2>
        {canWrite && !draft && (
          <button type="button" className={primary} onClick={() => (setResult(null), setDraft(emptyDraft()))}>
            New announcement
          </button>
        )}
      </div>

      {end.isSuccess && !draft && (
        <p className="mb-0 mt-3 text-sm text-muted" role="status">
          Ended “{endedTitle}”. Edge cache: {end.data.edgeCache}.
        </p>
      )}
      {end.isError && (
        <p className="mb-0 mt-3 text-sm text-red-700 dark:text-red-400" role="alert">
          Could not end it: {errorText(end.error)}
        </p>
      )}
      {result && !draft && (
        <p className="mb-0 mt-3 text-sm text-muted" role="status">
          Saved. Edge cache: {result.edgeCache}.
        </p>
      )}

      {draft && (
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            write.mutate({ draft, dryRun: false })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              Severity
              <select
                className={field}
                value={draft.severity}
                onChange={(e) => set('severity', e.target.value as Draft['severity'])}
              >
                {ANNOUNCEMENT_SEVERITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="text-sm" title="The public list includes a notice from 24 hours before it starts">
              Starts (empty: now)
              <input
                type="datetime-local"
                className={field}
                value={draft.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </label>
            <label className="text-sm">
              Ends (empty: no end)
              <input
                type="datetime-local"
                className={field}
                value={draft.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </label>
          </div>

          {draft.startsAt && Date.parse(fromLocalInput(draft.startsAt)!) - Date.now() > ANNOUNCEMENT_LOOKAHEAD_MS && (
            <p className="m-0 text-sm text-muted" role="note">
              Clients receive a scheduled notice up to 24 hours before it starts, so this one reaches them from{' '}
              {new Date(Date.parse(fromLocalInput(draft.startsAt)!) - ANNOUNCEMENT_LOOKAHEAD_MS).toLocaleString()}.
            </p>
          )}

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="text-sm font-medium">Text (English required; empty languages fall back)</legend>
            {SUPPORTED_LOCALES.map((locale) => (
              <div key={locale} className="grid gap-2 sm:grid-cols-[4rem_1fr_2fr]">
                <span className="pt-1.5 font-mono text-xs text-muted">{locale}</span>
                <input
                  aria-label={`Title (${locale})`}
                  placeholder="Title"
                  className={field}
                  maxLength={80}
                  required={locale === 'en'}
                  value={draft.title[locale] ?? ''}
                  onChange={(e) => setText('title', locale, e.target.value)}
                />
                <textarea
                  aria-label={`Body (${locale})`}
                  placeholder="Body"
                  className={field}
                  rows={2}
                  maxLength={500}
                  required={locale === 'en'}
                  value={draft.body[locale] ?? ''}
                  onChange={(e) => setText('body', locale, e.target.value)}
                />
              </div>
            ))}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Link (https URL or /path; optional)
              <input className={field} value={draft.linkUrl} onChange={(e) => set('linkUrl', e.target.value)} />
            </label>
            <label className="text-sm">
              Link label (en; optional)
              <input
                className={field}
                maxLength={40}
                value={draft.linkLabel.en ?? ''}
                onChange={(e) => setText('linkLabel', 'en', e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>
              Platforms (none: all):{' '}
              {ANNOUNCEMENT_PLATFORMS.map((p) => (
                <label key={p} className="mr-3">
                  <input
                    type="checkbox"
                    checked={draft.platforms.includes(p)}
                    onChange={() => toggle('platforms', p)}
                  />{' '}
                  {p}
                </label>
              ))}
            </span>
            <span>
              Regions (none: all):{' '}
              {ANNOUNCEMENT_REGIONS.map((r) => (
                <label key={r} className="mr-3">
                  <input type="checkbox" checked={draft.regions.includes(r)} onChange={() => toggle('regions', r)} />{' '}
                  {r}
                </label>
              ))}
            </span>
            <label>
              <input
                type="checkbox"
                checked={draft.dismissible}
                onChange={(e) => set('dismissible', e.target.checked)}
              />{' '}
              Dismissible
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              iOS from version (optional)
              <input
                className={field}
                placeholder="1.2"
                value={draft.minAppVersion}
                onChange={(e) => set('minAppVersion', e.target.value)}
              />
            </label>
            <label className="text-sm">
              iOS up to version (optional)
              <input
                className={field}
                placeholder="1.9"
                value={draft.maxAppVersion}
                onChange={(e) => set('maxAppVersion', e.target.value)}
              />
            </label>
          </div>

          {write.isError && (
            <p className="m-0 text-sm text-red-700 dark:text-red-400" role="alert">
              {errorText(write.error)}
            </p>
          )}

          {result?.dryRun && (
            <div className="rounded-md border border-black/10 p-3 dark:border-white/15" aria-label="Preview">
              <p className="m-0 text-sm font-medium">
                Preview{result.revision !== undefined ? ` (revision ${result.revision})` : ''}
              </p>
              <ul className="mb-0 mt-2 flex list-none flex-col gap-2 p-0 text-sm">
                {Object.entries(result.preview.title).map(([locale, title]) => {
                  const body = result.preview.body[locale]
                  const label = result.preview.linkLabel?.[locale]
                  return (
                    <li key={locale}>
                      <span className="font-mono text-xs text-muted">{locale}</span> <strong>{title.text}</strong>
                      {title.from !== locale && <span className="text-muted"> (title from {title.from})</span>}
                      {body && (
                        <span className="block whitespace-pre-line">
                          {body.text}
                          {body.from !== locale && <span className="text-muted"> (body from {body.from})</span>}
                        </span>
                      )}
                      {label && (
                        <span className="block text-muted">
                          Link: {label.text}
                          {label.from !== locale && ` (from ${label.from})`}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className={button}
              disabled={write.isPending}
              onClick={() => write.mutate({ draft, dryRun: true })}
            >
              Preview
            </button>
            <button type="submit" className={primary} disabled={write.isPending}>
              Save
            </button>
            <button type="button" className={button} onClick={() => (setDraft(null), setResult(null))}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {list.isError && (
        <p className="mb-0 mt-3 text-sm text-muted" role="alert">
          {errorText(list.error)}
        </p>
      )}
      {list.data && list.data.announcements.length === 0 && !draft && (
        <p className="mb-0 mt-3 text-sm text-muted">No announcements yet.</p>
      )}
      {list.data && list.data.announcements.length > 0 && (
        <ul className="mb-0 mt-4 flex list-none flex-col gap-2 p-0">
          {list.data.announcements.map((a) => {
            const status = statusOf(a)
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-black/8 px-3 py-2 dark:border-white/10"
              >
                <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">{status}</span>
                <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">{a.severity}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title.en}</span>
                <span className="text-xs text-muted">
                  r{a.revision} · {a.updatedBy}
                </span>
                {canWrite && status !== 'ended' && (
                  <span className="flex gap-2">
                    <button type="button" className={button} onClick={() => (setResult(null), setDraft(draftFrom(a)))}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={end.isPending}
                      onClick={() => window.confirm(`End “${a.title.en}” now?`) && end.mutate(a.id)}
                    >
                      End
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}