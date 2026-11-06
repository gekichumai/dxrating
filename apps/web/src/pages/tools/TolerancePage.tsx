import type { NoteCounts, TypeEnum } from '@gekichumai/dxdata'
import { InputAdornment, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiMagnify from '~icons/mdi/magnify'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { SheetImage } from '@/components/sheet/SheetListItem'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import { ToleranceCalculator } from '@/components/tools/ToleranceCalculator'
import { DIFFICULTIES } from '@/models/difficulties'
import { useFilteredSheets } from '@/songs'

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

export const TolerancePage: FC<{ sheet: ToleranceSelectedSheet | null }> = ({ sheet }) => {
  const { t } = useTranslation(['tools'])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const { results } = useFilteredSheets(deferredQuery)
  const visibleResults = deferredQuery ? limitResultsBySong(results, MAX_RESULT_SONGS) : []
  const resultGroups = groupResultsBySong(visibleResults)

  return (
    <div className="w-full max-w-2xl lg:max-w-6xl mx-auto px-4 py-6 pb-global flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="page-title m-0">{t('tools:tolerance.title')}</h1>
        <p className="page-description m-0">{t('tools:tolerance.intro')}</p>
        <Link to="/tools/rating" className="link self-start text-sm">
          {t('tools:rating.title')} →
        </Link>
      </header>

      {/* Stacked on mobile; at lg the picker is a sticky left column and the calculator fills the right */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <MaterialSurface className="flex flex-col gap-2 p-3">
            <TextField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('tools:tolerance.search-placeholder')}
              inputProps={{ 'aria-label': t('tools:tolerance.search-placeholder'), enterKeyHint: 'search' }}
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
              {deferredQuery ? t('tools:tolerance.result-count', { count: visibleResults.length }) : ''}
            </p>
            {visibleResults.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col lg:hidden">
                {visibleResults.map((result) => (
                  <li key={result.id}>
                    <Link
                      to="/tools/tolerance"
                      search={{ sheet: result.id }}
                      onClick={() => setQuery('')}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 no-underline text-inherit hover:bg-black/5"
                    >
                      <SheetImage name={result.imageName} size="small" alt="" />
                      <span className="flex flex-col min-w-0">
                        <span lang="ja" translate="no" className="truncate text-sm font-medium">
                          {result.title}
                        </span>
                        <span className="text-xs text-secondary tabular-nums">{sheetLabel(result)}</span>
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
                      <SheetImage name={sheets[0].imageName} size="small" alt="" />
                      <span lang="ja" translate="no" className="truncate text-sm font-medium">
                        {sheets[0].title}
                      </span>
                    </span>
                    <ul className="m-0 p-0 list-none flex flex-wrap gap-1" aria-label={sheets[0].title}>
                      {sheets.map((result) => (
                        <li key={result.id} className="flex">
                          <Link
                            to="/tools/tolerance"
                            search={{ sheet: result.id }}
                            onClick={() => setQuery('')}
                            aria-current={sheet?.id === result.id ? 'page' : undefined}
                            className={`inline-flex items-center rounded-[var(--radius-md)] border border-solid border-[var(--glass-border)] px-2 py-0.5 text-xs leading-5 tabular-nums no-underline text-inherit hover:bg-black/5 ${sheet?.id === result.id ? 'font-bold' : ''}`}
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
              <p className="m-0 px-1 text-sm text-secondary">{t('tools:tolerance.no-results')}</p>
            )}
          </MaterialSurface>

          {sheet && (
            <MaterialSurface variant="thin" className="flex items-center gap-3 p-3">
              <SheetImage name={sheet.imageName} size="medium" alt="" />
              <div className="flex flex-col min-w-0">
                <a
                  href={buildSheetPath({ songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty })}
                  lang="ja"
                  translate="no"
                  className="link truncate font-bold"
                >
                  {sheet.title}
                </a>
                <span className="text-xs text-secondary tabular-nums">{sheetLabel(sheet)}</span>
              </div>
            </MaterialSurface>
          )}
        </div>

        {sheet ? (
          <ToleranceCalculator key={sheet.id} sheet={sheet} source="tool_page" />
        ) : (
          <p className="m-0 text-sm text-secondary">{t('tools:tolerance.pick-a-chart')}</p>
        )}
      </div>
    </div>
  )
}