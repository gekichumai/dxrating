import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { SheetListItemContentView, SheetListItemSummary } from './SheetListItem'
import type { SearchQuerySeedSheet } from './searchQuerySeed'
import { InternalLink } from '@/components/global/InternalLink'

export const SearchQuerySeedList: FC<{ sheets: readonly SearchQuerySeedSheet[] }> = ({ sheets }) => {
  const { t } = useTranslation(['sheet'])

  if (sheets.length === 0) return null

  return (
    <ol className="glass m-0 w-full list-none p-1" data-testid="search-query-seed-list">
      {sheets.map((sheet) => (
        <li key={`${sheet.songId}-${sheet.type}-${sheet.difficulty}`}>
          <InternalLink
            // Rows match the virtualised list: --radius-md at a 4px inset, and the global focus ring drawn inside
            className="block w-full cursor-pointer rounded-[var(--radius-md)] px-2 md:px-3 no-underline text-inherit transition-colors duration-150 hover:duration-25 hover:bg-black/4 focus-visible:outline-offset-[-2px]"
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
                serverIds={sheet.serverIds}
                isLocked={sheet.isLocked}
                artist={sheet.artist}
              />
            </SheetListItemContentView>
          </InternalLink>
        </li>
      ))}
    </ol>
  )
}