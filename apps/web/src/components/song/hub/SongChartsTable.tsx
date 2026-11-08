import { type DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { Link, useSearch } from '@tanstack/react-router'
import clsx from 'clsx'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'
import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { FixedWidthText } from '@/components/global/FixedWidthText'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { SheetDifficulty } from '@/components/sheet/SheetListItem'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { m } from '@/paraglide/messages'
import { keepLocaleSearch } from '@/setup/locale'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { useUserRecords } from '@/models/useUserRecords'
import type { FlattenedSheet } from '@/songs'
import { computeSongHubRaises } from './songHubRaise'

const formatAchievement = (value: number) => `${value.toFixed(4)}%`

// Per-type note counts get their own columns on wide screens (xl+), where the table has room for them
const NOTE_TYPES = ['tap', 'hold', 'slide', 'touch', 'break'] as const

const NOTE_TYPE_LABELS = {
  tap: m.sheet_details_notesStatistics_tap,
  hold: m.sheet_details_notesStatistics_hold,
  slide: m.sheet_details_notesStatistics_slide,
  touch: m.sheet_details_notesStatistics_touch,
  break: m.sheet_details_notesStatistics_break,
} satisfies Record<(typeof NOTE_TYPES)[number], PlainMessage>

const TYPE_LABELS = {
  [TypeEnum.DX]: m.song_type_dx,
  [TypeEnum.STD]: m.song_type_std,
  [TypeEnum.UTAGE]: m.song_type_utage,
  [TypeEnum.UTAGE2P]: m.song_type_utage2p,
} satisfies Record<TypeEnum, PlainMessage>

// DX and STD in their chart-type colours (tokens.css --chart-type-*), as on the song page's type tabs; utage keeps fg-2.
// The DX gradient goes on the word itself, so it spans "DX" and not the width of the column's longest type name.
const TYPE_LABEL_CLASSES: Record<TypeEnum, { label: string; text?: string }> = {
  [TypeEnum.DX]: { label: 'font-bold', text: 'dx-lettering justify-self-start' },
  [TypeEnum.STD]: { label: 'text-chart-std-text font-bold' },
  [TypeEnum.UTAGE]: { label: 'text-fg-2' },
  [TypeEnum.UTAGE2P]: { label: 'text-fg-2' },
}

/** Every chart of a song in one table, with the user's own score and the next rating step (client only) */
export const SongChartsTable: FC<{
  songId: string
  sheets: readonly FlattenedSheet[]
  activeSheetId?: string
}> = ({ songId, sheets, activeSheetId }) => {
  const locale = useLocale()
  // Chart links stay on the hub URL's language variant (each `?locale=` variant is its own canonical page)
  const localeSearch = keepLocaleSearch(useSearch({ strict: false }))
  // Rating hints need every scored chart: the route slice holds only this song, so wait for the complete catalog
  const completeCatalog = useCompleteSongCatalog()
  const { region } = useAppContext()
  const version = useAppContextDXDataVersion()
  const { entries, bySheetId } = useUserRecords()
  // Scores are per-user: render them only after mount so SSR and the cached HTML stay user-independent
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const raises = useMemo(() => {
    if (!mounted || entries.length === 0 || !completeCatalog) return new Map()
    const songSheets = sheets.flatMap((sheet): VersionedSheet[] => {
      const versioned = completeCatalog.getById(sheet.id)
      return versioned ? [versioned] : []
    })
    return computeSongHubRaises({ songSheets, entries, catalog: completeCatalog, version, region })
  }, [mounted, entries, sheets, completeCatalog, version, region])

  const hasRecords = mounted && sheets.some((sheet) => bySheetId.has(sheet.id))
  const typeLabels = [...new Set(sheets.map((sheet) => TYPE_LABELS[sheet.type]({}, { locale })))]

  const reportedSongId = useRef<string | null>(null)
  useEffect(() => {
    if (!mounted || reportedSongId.current === songId) return
    reportedSongId.current = songId
    captureAnalyticsEvent('song_hub_viewed', { song_id: songId, has_records: hasRecords })
  }, [mounted, songId, hasRecords])

  if (sheets.length === 0) return null

  return (
    <MaterialSurface as="section" className="p-3 flex flex-col gap-2" aria-labelledby="song-hub-charts-heading">
      <h2 id="song-hub-charts-heading" className="section-title m-0">
        {m.song_hub_title({}, { locale })}
      </h2>
      <div className="scroll-fade-x relative overflow-x-auto -mx-1">
        <table className="w-full border-collapse text-sm num text-fg-1">
          <thead>
            <tr className="text-left text-xs text-fg-2">
              <th className="px-1 py-1 font-normal whitespace-nowrap">{m.song_hub_column_chart({}, { locale })}</th>
              <th className="px-1 py-1 font-normal whitespace-nowrap text-right">
                {m.song_hub_column_level({}, { locale })}
              </th>
              <th className="px-1 py-1 font-normal whitespace-nowrap text-right">
                {m.song_hub_column_constant({}, { locale })}
              </th>
              <th className="hidden sm:table-cell px-1 py-1 font-normal whitespace-nowrap text-right">
                {m.song_hub_column_notes({}, { locale })}
              </th>
              {NOTE_TYPES.map((noteType) => (
                <th key={noteType} className="hidden xl:table-cell px-1 py-1 font-normal whitespace-nowrap text-right">
                  {NOTE_TYPE_LABELS[noteType]({}, { locale })}
                </th>
              ))}
              <th className="hidden sm:table-cell pl-3 pr-1 py-1 font-normal whitespace-nowrap">
                {m.song_hub_column_designer({}, { locale })}
              </th>
              <th className="px-1 py-1 font-normal whitespace-nowrap text-right">
                {m.song_hub_column_myScore({}, { locale })}
              </th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((sheet) => {
              const record = mounted ? bySheetId.get(sheet.id) : undefined
              const raise = raises.get(sheet.id)
              const noteCounts = sheet.noteCounts
              const designer = sheet.noteDesigner && sheet.noteDesigner !== '-' ? sheet.noteDesigner : '—'
              const unavailableEverywhere = sheet.serverIds.length === 0
              return (
                <tr
                  key={sheet.id}
                  className={clsx(
                    // The whole row is the link target (stretched link below); hover tints the row where hover exists
                    'relative border-t border-solid border-0 border-black/8 transition-[background-color] duration-150 hover:bg-black/4',
                    sheet.id === activeSheetId && 'bg-accent-subtle',
                  )}
                >
                  <td className="px-1 py-1.5 whitespace-nowrap">
                    <Link
                      to="/songs/$songId/$type/$difficulty"
                      params={{ songId, type: sheet.type, difficulty: sheet.difficulty }}
                      {...localeSearch}
                      className="inline-flex items-center gap-1 no-underline text-inherit rounded-[var(--radius-sm)] after:absolute after:inset-0 after:content-['']"
                    >
                      {/* As wide as the longest type name in this table, so every difficulty pill starts at the same x */}
                      <FixedWidthText
                        text={TYPE_LABELS[sheet.type]({}, { locale })}
                        sizers={typeLabels}
                        className={clsx('shrink-0 text-xs', TYPE_LABEL_CLASSES[sheet.type].label)}
                        textClassName={TYPE_LABEL_CLASSES[sheet.type].text}
                      />
                      <SheetDifficulty difficulty={sheet.difficulty as DifficultyEnum} serverIds={sheet.serverIds} />
                      {unavailableEverywhere && (
                        <span className="sr-only">{m.song_hub_unavailableEverywhere({}, { locale })}</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-1 py-1.5 text-right">{sheet.level}</td>
                  <td className="px-1 py-1.5 text-right">
                    {sheet.isRatingEligible && sheet.internalLevelValue > 0 ? sheet.internalLevelValue.toFixed(1) : '—'}
                  </td>
                  <td className="hidden sm:table-cell px-1 py-1.5 whitespace-nowrap text-right">
                    {noteCounts?.total ? noteCounts.total.toLocaleString('en-US') : '—'}
                  </td>
                  {NOTE_TYPES.map((noteType) => (
                    <td
                      key={noteType}
                      className="hidden xl:table-cell px-1 py-1.5 whitespace-nowrap text-right text-fg-2"
                    >
                      {noteCounts?.total ? (noteCounts[noteType] ?? 0).toLocaleString('en-US') : '—'}
                    </td>
                  ))}
                  <td
                    className="hidden sm:table-cell pl-3 pr-1 py-1.5 max-w-40 lg:max-w-none truncate"
                    title={designer}
                  >
                    <span translate="no">{designer}</span>
                  </td>
                  <td className="px-1 py-1.5 whitespace-nowrap text-right">
                    {record ? (
                      <span className="font-semibold">{formatAchievement(record.entry.achievementRate)}</span>
                    ) : (
                      '—'
                    )}
                    {raise && (
                      <div className="text-xs text-status-positive whitespace-normal">
                        {m.song_hub_raiseHint({ target: raise.targetAchievement, gain: raise.gain }, { locale })}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </MaterialSurface>
  )
}