import { useEffect, useRef } from 'react'
import { findRolledChart } from './randomChart'

/**
 * Keeps the shown roll in step with `?chart=`: on load (once the catalog is in) and whenever the parameter changes
 * while the page stays mounted, such as Back past a same-page history entry. A roll sets its result before the URL
 * catches up, so the effect compares against the latest result through a ref and only runs when the URL changes.
 */
export const useRestoreRolledChart = <S extends { id: string }>({
  sheets,
  chart,
  result,
  setResult,
}: {
  sheets: readonly S[] | undefined
  chart: string | undefined
  result: S | null | undefined
  setResult: (sheet: S) => void
}) => {
  const latest = useRef(result)
  useEffect(() => {
    latest.current = result
  }, [result])
  useEffect(() => {
    if (!sheets || !chart || latest.current?.id === chart) return
    const restored = findRolledChart(sheets, chart)
    if (restored) setResult(restored)
  }, [sheets, chart, setResult])
}