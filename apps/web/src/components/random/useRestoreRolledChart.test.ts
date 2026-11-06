import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useRestoreRolledChart } from './useRestoreRolledChart'

const A = { id: 'dsht_a' }
const B = { id: 'dsht_b' }
const catalogSheets = [A, B]

const setup = (initial: { sheets?: typeof catalogSheets; chart?: string }) =>
  renderHook(
    ({ sheets, chart }: { sheets?: typeof catalogSheets; chart?: string }) => {
      const [result, setResult] = useState<{ id: string } | null | undefined>(undefined)
      useRestoreRolledChart({ sheets, chart, result, setResult })
      return { result, setResult }
    },
    { initialProps: initial },
  )

describe('useRestoreRolledChart', () => {
  it('waits for the catalog, then restores the chart in the URL', () => {
    const { result, rerender } = setup({ chart: A.id })
    expect(result.current.result).toBeUndefined()
    rerender({ sheets: catalogSheets, chart: A.id })
    expect(result.current.result).toBe(A)
  })

  it('keeps a fresh roll while the URL catches up', () => {
    const { result, rerender } = setup({ sheets: catalogSheets, chart: A.id })
    act(() => result.current.setResult(B))
    rerender({ sheets: catalogSheets, chart: A.id })
    expect(result.current.result).toBe(B)
    rerender({ sheets: catalogSheets, chart: B.id })
    expect(result.current.result).toBe(B)
  })

  it('follows Back to an earlier chart while the page stays mounted', () => {
    const { result, rerender } = setup({ sheets: catalogSheets, chart: A.id })
    expect(result.current.result).toBe(A)
    act(() => result.current.setResult(B))
    rerender({ sheets: catalogSheets, chart: B.id })
    rerender({ sheets: catalogSheets, chart: A.id })
    expect(result.current.result).toBe(A)
  })

  it('ignores an unknown chart', () => {
    const { result } = setup({ sheets: catalogSheets, chart: 'dsht_missing' })
    expect(result.current.result).toBeUndefined()
  })
})