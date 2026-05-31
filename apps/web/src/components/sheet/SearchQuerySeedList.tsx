import type { FC } from 'react'
import type { SearchQuerySeedSheet } from './searchQuerySeed'

export const SearchQuerySeedList: FC<{ sheets: readonly SearchQuerySeedSheet[] }> = ({ sheets }) => {
  if (sheets.length === 0) return null

  return (
    <ol
      className="w-full bg-white/90 border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-200 overflow-hidden"
      data-testid="search-query-seed-list"
    >
      {sheets.map((sheet) => (
        <li key={`${sheet.songId}-${sheet.type}-${sheet.difficulty}`}>
          <a
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:gap-3 px-5 py-3 text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
            href={sheet.path}
          >
            <span className="min-w-0 flex flex-col gap-1">
              <span className="font-semibold truncate">{sheet.title}</span>
              <span className="text-sm text-slate-600 truncate">{sheet.artist}</span>
            </span>
            <span className="flex items-center sm:justify-end text-sm font-semibold text-slate-800">
              {sheet.type.toUpperCase()} {sheet.difficulty} {sheet.level}
            </span>
          </a>
        </li>
      ))}
    </ol>
  )
}