import { type FC, useId } from 'react'
import { BackToHomeLink } from '@/components/global/BackToHomeLink'
import type { RecentChartLink } from '@/components/chartDiscovery/recentCharts'
import { SheetListItemContentView, SheetListItemSummary } from '@/components/sheet/SheetListItem'
import { SHEET_ROW_INSET, SheetRowLayoutContext } from '@/components/sheet/sheetRowLayout'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import type { SupportedLocale } from '@/setup/locale'
import { formatSheetReleaseDateParts, sheetReleaseDateTimestamp } from '@/utils/dateFormatting'
import { InternalLink } from '@/components/global/InternalLink'

type RecentPageProps = {
  charts: readonly RecentChartLink[]
}

const siteUrl = 'https://dxrating.net'

const toAbsoluteChartUrl = (href: string) => new URL(href, siteUrl).toString()

type RecentChartGroup = {
  key: string
  releaseDate?: string
  version: string
  charts: { chart: RecentChartLink; position: number }[]
}

/**
 * One group per release date (or, for undated charts, per version), in the order each is first seen. Undated charts
 * sort by a fallback timestamp, so they can fall between two charts of the same date; a Map keeps that date to one
 * section. Positions are numbered in the order the groups render, so the ItemList stays continuous.
 */
export const groupRecentCharts = (charts: readonly RecentChartLink[]): RecentChartGroup[] => {
  const groups = new Map<string, RecentChartGroup>()
  for (const chart of charts) {
    const key = chart.releaseDate ? `date-${chart.releaseDate}` : `version-${chart.version}`
    const group = groups.get(key)
    if (group) {
      group.charts.push({ chart, position: 0 })
    } else {
      groups.set(key, { key, releaseDate: chart.releaseDate, version: chart.version, charts: [{ chart, position: 0 }] })
    }
  }
  let position = 0
  for (const group of groups.values()) {
    for (const entry of group.charts) entry.position = ++position
  }
  return [...groups.values()]
}

export const RecentPage: FC<RecentPageProps> = ({ charts }) => {
  const locale = useLocale()
  const groups = groupRecentCharts(charts)

  return (
    <div
      className="flex-container w-full max-w-5xl lg:max-w-7xl px-4 pb-global"
      itemScope
      itemType="https://schema.org/CollectionPage"
    >
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          {/* Only after arriving from Home, so it renders with the page on that navigation, never on the server */}
          <BackToHomeLink />
          <h1 className="page-title m-0" itemProp="name">
            {m.sheet_chartDiscovery_recent_title({}, { locale })}
          </h1>
          <p className="page-description m-0" itemProp="description">
            {m.sheet_chartDiscovery_recent_description({ count: charts.length }, { locale })}
          </p>
        </header>

        {/* One list for the page's structured data; on screen the charts are grouped by release date. Every row uses
            the table layout, so from lg each chart is one 56px line of fixed columns (art | title | artist | version |
            type + difficulty | level) that lines up with every other row; below lg the rows stack as before */}
        <div
          className="w-full flex flex-col gap-4"
          itemProp="mainEntity"
          itemScope
          itemType="https://schema.org/ItemList"
        >
          <meta itemProp="numberOfItems" content={String(charts.length)} />
          <SheetRowLayoutContext.Provider value="table">
            {groups.map((group) => (
              <RecentChartGroupSection key={group.key} group={group} locale={locale} />
            ))}
          </SheetRowLayoutContext.Provider>
        </div>
      </div>
    </div>
  )
}

const RecentChartGroupSection: FC<{ group: RecentChartGroup; locale: SupportedLocale }> = ({ group, locale }) => {
  const headingId = `${useId()}recent-${group.key}`

  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-2">
      {/* Sticky over the rows, so it takes the denser overlay tint and the full blur: rows passing under it must not
          read through */}
      <div className="glass-thin sticky top-1 z-2 flex items-baseline justify-between gap-2 px-3 py-1.5 bg-[var(--glass-overlay-bg)] [-webkit-backdrop-filter:var(--glass-blur)] [backdrop-filter:var(--glass-blur)]">
        <h2 id={headingId} className="m-0 text-base font-semibold text-fg-1 num">
          {group.releaseDate ? (
            <time dateTime={group.releaseDate}>
              {/* The date alone (no "days ago"), so the cached page never goes stale */}
              {
                formatSheetReleaseDateParts(group.releaseDate, locale, sheetReleaseDateTimestamp(group.releaseDate))
                  .absoluteDate
              }
            </time>
          ) : (
            `ver. ${group.version}`
          )}
        </h2>
        <span className="text-xs text-fg-2 num">{m.toplists_count({ count: group.charts.length }, { locale })}</span>
      </div>
      {/* Rows are --radius-md at a 4px inset, so they nest in the panel's --radius-lg */}
      <ol className="glass m-0 w-full list-none p-1">
        {group.charts.map(({ chart, position }) => (
          <RecentChartRow
            key={`${chart.songId}-${chart.type}-${chart.difficulty}`}
            chart={chart}
            position={position}
            locale={locale}
          />
        ))}
      </ol>
    </section>
  )
}

const RecentChartRow: FC<{ chart: RecentChartLink; position: number; locale: SupportedLocale }> = ({
  chart,
  position,
  locale,
}) => {
  const chartUrl = toAbsoluteChartUrl(chart.href)
  const sheetLabel = getSheetTitleLabel(chart, locale)
  const levelLabel = m.sheet_chartDiscovery_level({ level: chart.level }, { locale })

  return (
    <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
      <meta itemProp="position" content={String(position)} />
      <link itemProp="url" href={chartUrl} />
      <InternalLink
        className={`block rounded-[var(--radius-md)] ${SHEET_ROW_INSET} text-fg-1 no-underline transition-colors duration-150 hover:bg-black/4 focus-visible:outline-offset-[-2px]`}
        href={chart.href}
      >
        <article className="block" itemScope itemType="https://schema.org/MusicRecording" itemID={chartUrl}>
          <link itemProp="url" href={chartUrl} />
          <meta itemProp="identifier" content={`${chart.songId}/${chart.type}/${chart.difficulty}`} />
          <meta itemProp="additionalType" content="maimai DX chart" />
          {chart.releaseDate && <meta itemProp="datePublished" content={chart.releaseDate} />}
          <span itemProp="additionalProperty" itemScope itemType="https://schema.org/PropertyValue">
            <meta itemProp="name" content="Chart type" />
            <meta itemProp="value" content={chart.type} />
          </span>
          <span itemProp="additionalProperty" itemScope itemType="https://schema.org/PropertyValue">
            <meta itemProp="name" content="Difficulty" />
            <meta itemProp="value" content={chart.difficulty} />
          </span>
          <span itemProp="additionalProperty" itemScope itemType="https://schema.org/PropertyValue">
            <meta itemProp="name" content="Level" />
            <meta itemProp="value" content={chart.level} />
          </span>
          <meta itemProp="description" content={`${sheetLabel} ${levelLabel}`} />
          <SheetListItemContentView
            level={chart.level}
            internalLevelValue={chart.internalLevelValue}
            isTypeUtage={chart.isTypeUtage}
            imageName={chart.imageName}
            imageAlt={m.sheet_coverArtAlt({ title: chart.title }, { locale })}
          >
            <SheetListItemSummary
              title={chart.title}
              type={chart.type}
              difficulty={chart.difficulty}
              version={chart.version}
              serverIds={chart.serverIds}
              isLocked={chart.isLocked}
              titleElement="h3"
              titleTextProps={{ itemProp: 'name' }}
              artist={<span itemProp="name">{chart.artist}</span>}
              artistProps={{
                itemProp: 'byArtist',
                itemScope: true,
                itemType: 'https://schema.org/MusicGroup',
              }}
            />
          </SheetListItemContentView>
        </article>
      </InternalLink>
    </li>
  )
}