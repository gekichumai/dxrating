import type { NoteCounts, TypeEnum } from '@gekichumai/dxdata'
import { InputAdornment, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, useDeferredValue, useState } from 'react'
import MdiMagnify from '~icons/mdi/magnify'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { SheetImage } from '@/components/sheet/SheetListItem'
import { Breadcrumb } from '@/components/completion/TableChrome'
import { buildSheetPath, songHubPath } from '@/components/sheet/sheetLinks'
import { ToleranceCalculator } from '@/components/tools/ToleranceCalculator'
import { DIFFICULTIES } from '@/models/difficulties'
import { useFilteredSheets } from '@/songs'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { InternalLink } from '@/components/global/InternalLink'

export type ToleranceSelectedSheet = {
  id: string
  songId: string
  title: string
  imageName: string
  type: TypeEnum
  difficulty: string
  internalLevelValue: number
  noteCounts?: NoteCounts
}

/** Songs shown in the picker; every chart of a shown song stays listed, so no difficulty is unreachable */
const MAX_RESULT_SONGS = 4

export function limitResultsBySong<T extends { songId: string }>(results: readonly T[], maxSongs: number): T[] {
  const songs = new Set<string>()
  return results.filter((result) => {
    if (songs.has(result.songId)) return true
    if (songs.size >= maxSongs) return false
    songs.add(result.songId)
    return true
  })
}

/** Consecutive results of one song, so the desktop picker shows each song once with its charts as chips */
export function groupResultsBySong<T extends { songId: string }>(
  results: readonly T[],
): { songId: string; sheets: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const result of results) {
    const sheets = groups.get(result.songId)
    if (sheets) sheets.push(result)
    else groups.set(result.songId, [result])
  }
  return [...groups].map(([songId, sheets]) => ({ songId, sheets }))
}

const sheetLabel = (sheet: { type: string; difficulty: string; internalLevelValue: number }) =>
  `${sheet.type.toUpperCase()} ${DIFFICULTIES[sheet.difficulty as keyof typeof DIFFICULTIES]?.title ?? sheet.difficulty} ${sheet.internalLevelValue.toFixed(1)}`

/**
 * The tolerance calculator. Without a chart it is the picker at `/tools/tolerance`; with one it is that chart's page at
 * `/songs/<id>/<type>/<difficulty>/tolerance`, and the picker switches to another chart.
 */
export const TolerancePage: FC<{ sheet: ToleranceSelectedSheet | null }> = ({ sheet }) => {
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const { results } = useFilteredSheets(deferredQuery)
  const visibleResults = deferredQuery ? limitResultsBySong(results, MAX_RESULT_SONGS) : []
  const resultGroups = groupResultsBySong(visibleResults)
  const sheetPath = sheet
    ? buildSheetPath({ songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty })
    : ''

  const picker = (
    <MaterialSurface className="flex flex-col gap-2 p-3">
      <TextField
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={
          sheet ? m.tools_tolerance_searchAnother({}, { locale }) : m.tools_tolerance_searchPlaceholder({}, { locale })
        }
        inputProps={{
          'aria-label': sheet
            ? m.tools_tolerance_searchAnother({}, { locale })
            : m.tools_tolerance_searchPlaceholder({}, { locale }),
          enterKeyHint: 'search',
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <MdiMagnify />
            </InputAdornment>
          ),
        }}
        size="small"
        fullWidth
      />
      {/* Always mounted, so screen readers hear how many charts match */}
      <p role="status" className="sr-only">
        {deferredQuery ? m.tools_tolerance_resultCount({ count: visibleResults.length }, { locale }) : ''}
      </p>
      {/* Below lg: one row per chart. At lg: one row per song, with its charts as chips. */}
      {visibleResults.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col lg:hidden">
          {visibleResults.map((result) => (
            <li key={result.id}>
              <Link
                to="/songs/$songId/$type/$difficulty/tolerance"
                params={{ songId: result.songId, type: result.type, difficulty: result.difficulty }}
                onClick={() => setQuery('')}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 no-underline text-inherit hover:bg-black/5"
              >
                <SheetImage songId={result.songId} size="small" alt="" />
                <span className="flex flex-col min-w-0">
                  <span lang="ja" translate="no" className="truncate text-sm font-medium">
                    {result.title}
                  </span>
                  <span className="text-xs text-secondary num">{sheetLabel(result)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {resultGroups.length > 0 && (
        <ul className="m-0 p-0 list-none hidden lg:flex flex-col gap-2">
          {resultGroups.map(({ songId, sheets }) => (
            <li key={songId} className="flex flex-col gap-1.5 px-1 py-1">
              <span className="flex items-center gap-2 min-w-0">
                <SheetImage songId={songId} size="small" alt="" />
                <span lang="ja" translate="no" className="truncate text-sm font-medium">
                  {sheets[0].title}
                </span>
              </span>
              <ul className="m-0 p-0 list-none flex flex-wrap gap-1" aria-label={sheets[0].title}>
                {sheets.map((result) => (
                  <li key={result.id} className="flex">
                    <Link
                      to="/songs/$songId/$type/$difficulty/tolerance"
                      params={{ songId: result.songId, type: result.type, difficulty: result.difficulty }}
                      onClick={() => setQuery('')}
                      aria-current={sheet?.id === result.id ? 'page' : undefined}
                      className={`inline-flex items-center rounded-[var(--radius-md)] border border-solid border-[var(--glass-border)] px-2 py-0.5 text-xs leading-5 num no-underline text-inherit hover:bg-black/5 ${sheet?.id === result.id ? 'font-bold' : ''}`}
                    >
                      {sheetLabel(result)}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {deferredQuery && visibleResults.length === 0 && (
        <p className="m-0 px-1 text-sm text-secondary">{m.tools_tolerance_noResults({}, { locale })}</p>
      )}
    </MaterialSurface>
  )

  if (!sheet) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-global flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 className="page-title m-0">{m.tools_tolerance_title({}, { locale })}</h1>
          <p className="page-description m-0">{m.tools_tolerance_intro({}, { locale })}</p>
          <Link to="/tools/rating" className="link self-start text-sm">
            {m.tools_rating_title({}, { locale })} →
          </Link>
        </header>
        {picker}
        <p className="m-0 text-sm text-secondary">{m.tools_tolerance_pickAChart({}, { locale })}</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 pb-global flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Breadcrumb
          items={[
            { href: songHubPath(sheet.songId), label: <span lang="ja">{sheet.title}</span> },
            { href: sheetPath, label: sheetLabel(sheet) },
            { label: m.tools_tolerance_title({}, { locale }) },
          ]}
        />
        <h1 className="page-title m-0 [word-break:auto-phrase]">{m.tools_tolerance_title({}, { locale })}</h1>
      </header>

      {/* Mobile: chart, calculator, then the picker. Desktop: chart and picker beside the calculator. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
        <MaterialSurface variant="thin" className="flex items-center gap-3 p-3 lg:col-start-1 lg:row-start-1">
          <SheetImage songId={sheet.songId} size="large" alt="" />
          <div className="flex flex-col min-w-0">
            <InternalLink href={sheetPath} lang="ja" translate="no" className="link font-bold [overflow-wrap:anywhere]">
              {sheet.title}
            </InternalLink>
            <span className="text-xs text-secondary num">{sheetLabel(sheet)}</span>
          </div>
        </MaterialSurface>
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <ToleranceCalculator key={sheet.id} sheet={sheet} source="tool_page" headingAs="h2" />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">{picker}</div>
      </div>
    </div>
  )
}