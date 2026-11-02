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

const MAX_RESULTS = 8

const sheetLabel = (sheet: { type: string; difficulty: string; internalLevelValue: number }) =>
  `${sheet.type.toUpperCase()} ${sheet.difficulty.toUpperCase()} ${sheet.internalLevelValue.toFixed(1)}`

export const TolerancePage: FC<{ sheet: ToleranceSelectedSheet | null }> = ({ sheet }) => {
  const { t } = useTranslation(['tools'])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const { results } = useFilteredSheets(deferredQuery)
  const visibleResults = deferredQuery ? results.slice(0, MAX_RESULTS) : []

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-global flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-3xl font-bold">{t('tools:tolerance.title')}</h1>
        <p className="m-0 text-sm text-slate-700 dark:text-slate-300">{t('tools:tolerance.intro')}</p>
        <Link to="/tools/rating" className="self-start text-sm text-slate-700 dark:text-slate-300">
          {t('tools:rating.title')} →
        </Link>
      </header>

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
        {visibleResults.length > 0 && (
          <ul className="m-0 p-0 list-none flex flex-col">
            {visibleResults.map((result) => (
              <li key={result.id}>
                <Link
                  to="/tools/tolerance"
                  search={{ sheet: result.id }}
                  onClick={() => setQuery('')}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 no-underline text-inherit hover:bg-black/5 dark:hover:bg-white/8"
                >
                  <SheetImage name={result.imageName} size="small" alt="" />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate text-sm font-medium">{result.title}</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      {sheetLabel(result)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {deferredQuery && visibleResults.length === 0 && (
          <p className="m-0 px-1 text-sm text-slate-600 dark:text-slate-400">{t('tools:tolerance.no-results')}</p>
        )}
      </MaterialSurface>

      {sheet ? (
        <>
          <MaterialSurface variant="thin" className="flex items-center gap-3 p-3">
            <SheetImage name={sheet.imageName} size="medium" alt="" />
            <div className="flex flex-col min-w-0">
              <a
                href={buildSheetPath({ songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty })}
                className="truncate font-bold text-inherit"
              >
                {sheet.title}
              </a>
              <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">{sheetLabel(sheet)}</span>
            </div>
          </MaterialSurface>
          <ToleranceCalculator key={sheet.id} sheet={sheet} source="tool_page" />
        </>
      ) : (
        <p className="m-0 text-sm text-slate-600 dark:text-slate-400">{t('tools:tolerance.pick-a-chart')}</p>
      )}
    </div>
  )
}