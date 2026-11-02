import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConstantTable } from '@/components/chartDiscovery/constantTables'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useUserRecords } from '@/models/useUserRecords'
import {
  type CompletionStatus,
  type CompletionSummary,
  type CompletionTarget,
  completionStatus,
  DEFAULT_COMPLETION_TARGET,
  parseCompletionTarget,
  summarizeCompletion,
} from './completion'

export type CompletionFilter = 'all' | CompletionStatus

export interface CompletionOverlayState {
  /** False on the server and the first client render, so the SSR HTML stays user-agnostic */
  mounted: boolean
  /** Mounted and the visitor has at least one record */
  active: boolean
  target: CompletionTarget
  setTarget: (target: CompletionTarget) => void
  filter: CompletionFilter
  setFilter: (filter: CompletionFilter) => void
  summary: CompletionSummary
  records: ReturnType<typeof useUserRecords>['bySheetId']
  statusOf: (sheetId: string) => CompletionStatus
  isVisible: (sheetId: string) => boolean
}

export const COMPLETION_TARGET_QUERY_PARAM = 'target'

export function useCompletionOverlay(table: ConstantTable): CompletionOverlayState {
  const [mounted, setMounted] = useState(false)
  const [target, setTargetState] = useState<CompletionTarget>(DEFAULT_COMPLETION_TARGET)
  const [filter, setFilter] = useState<CompletionFilter>('all')
  const { bySheetId } = useUserRecords()

  useEffect(() => {
    const fromUrl = parseCompletionTarget(new URL(window.location.href).searchParams.get(COMPLETION_TARGET_QUERY_PARAM))
    if (fromUrl) setTargetState(fromUrl)
    setMounted(true)
  }, [])

  const records = useMemo(() => (mounted ? bySheetId : new Map()), [mounted, bySheetId])
  const active = mounted && records.size > 0
  const sheetIds = useMemo(() => table.groups.flatMap((group) => group.charts.map((chart) => chart.sheetId)), [table])
  const summary = useMemo(() => summarizeCompletion(sheetIds, records, target), [sheetIds, records, target])

  const setTarget = (next: CompletionTarget) => {
    setTargetState(next)
    const url = new URL(window.location.href)
    if (next === DEFAULT_COMPLETION_TARGET) url.searchParams.delete(COMPLETION_TARGET_QUERY_PARAM)
    else url.searchParams.set(COMPLETION_TARGET_QUERY_PARAM, next)
    window.history.replaceState(window.history.state, '', url)
    captureAnalyticsEvent('completion_overlay_target_changed', { level: table.level, target: next })
  }

  // One view event per level and target, once the records are in
  const reported = useRef(new Set<string>())
  useEffect(() => {
    if (!active) return
    const key = `${table.level}:${target}`
    if (reported.current.has(key)) return
    reported.current.add(key)
    captureAnalyticsEvent('level_progress_viewed', {
      level: table.level,
      target,
      completed: summary.done,
      total: summary.total,
    })
  }, [active, table.level, target, summary])

  const statusOf = (sheetId: string) => completionStatus(records.get(sheetId)?.entry, target)

  return {
    mounted,
    active,
    target,
    setTarget,
    filter,
    setFilter,
    summary,
    records,
    statusOf,
    isVisible: (sheetId) => !active || filter === 'all' || statusOf(sheetId) === filter,
  }
}