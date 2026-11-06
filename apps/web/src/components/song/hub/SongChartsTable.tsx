import type { DifficultyEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { SheetDifficulty } from '@/components/sheet/SheetListItem'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { useUserRecords } from '@/models/useUserRecords'
import type { FlattenedSheet } from '@/songs'
import { computeSongHubRaises } from './songHubRaise'

const formatAchievement = (value: number) => `${value.toFixed(4)}%`

/** Every chart of a song in one table, with the user's own score and the next rating step (client only) */
export const SongChartsTable: FC<{
  songId: string
  sheets: readonly FlattenedSheet[]
  activeSheetId?: string
}> = ({ songId, sheets, activeSheetId }) => {
  const { t } = useTranslation(['song'])
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
        {t('song:hub.title')}
      </h2>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full border-collapse text-sm tabular-nums text-fg-1">
          <thead>
            <tr className="text-left text-xs text-fg-2">
              <th className="px-1 py-1 font-normal whitespace-nowrap">{t('song:hub.column.chart')}</th>
              <th className="px-1 py-1 font-normal whitespace-nowrap">{t('song:hub.column.level')}</th>
              <th className="px-1 py-1 font-normal whitespace-nowrap">{t('song:hub.column.constant')}</th>
              <th className="hidden sm:table-cell px-1 py-1 font-normal whitespace-nowrap">
                {t('song:hub.column.notes')}
              </th>
              <th className="hidden sm:table-cell px-1 py-1 font-normal whitespace-nowrap">
                {t('song:hub.column.designer')}
              </th>
              <th className="px-1 py-1 font-normal whitespace-nowrap">{t('song:hub.column.my-score')}</th>
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
                      className="inline-flex items-center gap-1 no-underline text-inherit rounded-[var(--radius-sm)] after:absolute after:inset-0 after:content-['']"
                    >
                      <span className="inline-block sm:w-[6.5em] shrink-0 text-xs text-fg-2">
                        {t(`song:type.${sheet.type}`)}
                      </span>
                      <SheetDifficulty difficulty={sheet.difficulty as DifficultyEnum} serverIds={sheet.serverIds} />
                      {unavailableEverywhere && <span className="sr-only">{t('song:hub.unavailable-everywhere')}</span>}
                    </Link>
                  </td>
                  <td className="px-1 py-1.5">{sheet.level}</td>
                  <td className="px-1 py-1.5">
                    {sheet.isRatingEligible && sheet.internalLevelValue > 0 ? sheet.internalLevelValue.toFixed(1) : '—'}
                  </td>
                  <td className="hidden sm:table-cell px-1 py-1.5 whitespace-nowrap">
                    {noteCounts?.total ? noteCounts.total.toLocaleString('en-US') : '—'}
                  </td>
                  <td className="hidden sm:table-cell px-1 py-1.5 max-w-40 truncate" title={designer}>
                    <span translate="no">{designer}</span>
                  </td>
                  <td className="px-1 py-1.5 whitespace-nowrap">
                    {record ? (
                      <span className="font-semibold">{formatAchievement(record.entry.achievementRate)}</span>
                    ) : (
                      '—'
                    )}
                    {raise && (
                      <div className="text-xs text-status-positive whitespace-normal">
                        {t('song:hub.raise-hint', { target: raise.targetAchievement, gain: raise.gain })}
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