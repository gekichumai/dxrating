import type { NoteCounts, TypeEnum } from '@gekichumai/dxdata'
import { InputAdornment, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiMagnify from '~icons/mdi/magnify'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { SheetImage } from '@/components/sheet/SheetListItem'
import { Breadcrumb } from '@/components/completion/TableChrome'
import { buildSheetPath, songHubPath } from '@/components/sheet/sheetLinks'
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

const sheetLabel = (sheet: { type: string; difficulty: string; internalLevelValue: number }) =>
  `${sheet.type.toUpperCase()} ${DIFFICULTIES[sheet.difficulty as keyof typeof DIFFICULTIES]?.title ?? sheet.difficulty} ${sheet.internalLevelValue.toFixed(1)}`

/**
 * The tolerance calculator. Without a chart it is the picker at `/tools/tolerance`; with one it is that chart's page at
 * `/songs/<id>/<type>/<difficulty>/tolerance`, and the picker switches to another chart.
 */
export const TolerancePage: FC<{ sheet: ToleranceSelectedSheet | null }> = ({ sheet }) => {
  const { t } = useTranslation(['tools'])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const { results } = useFilteredSheets(deferredQuery)
  const visibleResults = deferredQuery ? limitResultsBySong(results, MAX_RESULT_SONGS) : []
  const sheetPath = sheet
    ? buildSheetPath({ songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty })
    : ''

  const picker = (
    <MaterialSurface className="flex flex-col gap-2 p-3">
      <TextField
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t(sheet ? 'tools:tolerance.search-another' : 'tools:tolerance.search-placeholder')}
        inputProps={{
          'aria-label': t(sheet ? 'tools:tolerance.search-another' : 'tools:tolerance.search-placeholder'),
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
        {deferredQuery ? t('tools:tolerance.result-count', { count: visibleResults.length }) : ''}
      </p>
      {visibleResults.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col">
          {visibleResults.map((result) => (
            <li key={result.id}>
              <Link
                to="/songs/$songId/$type/$difficulty/tolerance"
                params={{ songId: result.songId, type: result.type, difficulty: result.difficulty }}
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
      {deferredQuery && visibleResults.length === 0 && (
        <p className="m-0 px-1 text-sm text-secondary">{t('tools:tolerance.no-results')}</p>
      )}
    </MaterialSurface>
  )

  if (!sheet) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-global flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 className="page-title m-0">{t('tools:tolerance.title')}</h1>
          <p className="page-description m-0">{t('tools:tolerance.intro')}</p>
          <Link to="/tools/rating" className="link self-start text-sm">
            {t('tools:rating.title')} →
          </Link>
        </header>
        {picker}
        <p className="m-0 text-sm text-secondary">{t('tools:tolerance.pick-a-chart')}</p>
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
            { label: t('tools:tolerance.title') },
          ]}
        />
        <h1 className="page-title m-0 [word-break:auto-phrase]">{t('tools:tolerance.title')}</h1>
      </header>

      {/* Mobile: chart, calculator, then the picker. Desktop: chart and picker beside the calculator. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
        <MaterialSurface variant="thin" className="flex items-center gap-3 p-3 lg:col-start-1 lg:row-start-1">
          <SheetImage name={sheet.imageName} size="large" alt="" />
          <div className="flex flex-col min-w-0">
            <a href={sheetPath} lang="ja" translate="no" className="link font-bold [overflow-wrap:anywhere]">
              {sheet.title}
            </a>
            <span className="text-xs text-secondary tabular-nums">{sheetLabel(sheet)}</span>
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