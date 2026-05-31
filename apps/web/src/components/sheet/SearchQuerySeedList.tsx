import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { SheetListItemContentView, SheetListItemSummary } from './SheetListItem'
import type { SearchQuerySeedSheet } from './searchQuerySeed'

export const SearchQuerySeedList: FC<{ sheets: readonly SearchQuerySeedSheet[] }> = ({ sheets }) => {
  const { t } = useTranslation(['sheet'])

  if (sheets.length === 0) return null

  return (
    <ol className="w-full" data-testid="search-query-seed-list">
      {sheets.map((sheet) => (
        <li key={`${sheet.songId}-${sheet.type}-${sheet.difficulty}`}>
          <a
            className="block w-full cursor-pointer transition duration-500 hover:duration-25 px-4 no-underline text-inherit hover:bg-zinc-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
            href={sheet.path}
          >
            <SheetListItemContentView
              level={sheet.level}
              internalLevelValue={sheet.internalLevelValue}
              isTypeUtage={sheet.isTypeUtage}
              imageName={sheet.imageName}
              imageAlt={t('sheet:cover-art-alt', { title: sheet.title })}
            >
              <SheetListItemSummary
                title={sheet.title}
                type={sheet.type}
                difficulty={sheet.difficulty}
                version={sheet.version}
                regions={sheet.regions}
                isLocked={sheet.isLocked}
                artist={sheet.artist}
              />
            </SheetListItemContentView>
          </a>
        </li>
      ))}
    </ol>
  )
}