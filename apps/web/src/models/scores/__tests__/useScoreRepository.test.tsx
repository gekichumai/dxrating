import { act, renderHook, waitFor } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorContextProvider, useRatingCalculatorContext } from '../../context/RatingCalculatorContext'
import { LocalScoreRepository } from '../LocalScoreRepository'
import {
  isScoreRepositoryOverrideAllowed,
  type ScoreReadState,
  ScoreRepositoryContext,
  ScoreRepositoryOverrideProvider,
  useIsScoreRepositoryOverridden,
  useScoreReadState,
  useScoreRecords,
  useScoreRepository,
} from '../useScoreRepository'

const IDENTITY = { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' } as const

const renderRepository = () =>
  renderHook(
    () => ({
      repository: useScoreRepository(),
      records: useScoreRecords(),
      context: useRatingCalculatorContext(),
    }),
    { wrapper: RatingCalculatorContextProvider },
  )

describe('useScoreRepository', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('is the local save behind the rating calculator context', () => {
    window.localStorage.setItem(
      'rating-calculator-entries',
      JSON.stringify([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 }]),
    )
    const { result } = renderRepository()

    expect(result.current.repository.kind).toBe('local')
    expect(result.current.context.entries).toEqual([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 }])
  })

  it('fills in identities from the catalog for the records', async () => {
    window.localStorage.setItem(
      'rating-calculator-entries',
      JSON.stringify([{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5 }]),
    )
    const { result } = renderRepository()

    await waitFor(() =>
      expect(result.current.records).toEqual([
        expect.objectContaining({
          sheetId: 'dsht_e5nsvt8k2a',
          identity: { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' },
          achievement: 1005000,
        }),
      ]),
    )
  })

  it('shows repository writes to readers of either view', async () => {
    const { result } = renderRepository()

    act(() => {
      result.current.repository.setManual({ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 }, 'typed')
    })
    expect(result.current.context.entries).toEqual([{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 }])
    expect(result.current.records.map((record) => record.achievement)).toEqual([990000])

    act(() => {
      result.current.context.modifyEntries.push({ sheetId: 'dsht_5mk3yr8gme', achievementRate: 98 })
    })
    expect(result.current.repository.entries()).toHaveLength(2)

    act(() => {
      result.current.repository.delete(['dsht_e5nsvt8k2a'])
    })
    expect(result.current.context.entries).toEqual([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 98 }])

    act(() => {
      result.current.repository.clear()
    })
    expect(result.current.records).toEqual([])
    expect(window.localStorage.getItem('rating-calculator-entries')).toBe('[]')
  })
})
const SAVED = [{ sheetId: 'dsht_e5nsvt8k2a', identity: IDENTITY, achievementRate: 100.5 }]

describe('useScoreReadState', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('rating-calculator-entries', JSON.stringify(SAVED))
  })

  it('renders no scores and not ready on the server', () => {
    const seen: ScoreReadState[] = []
    const Probe = () => {
      const state = useScoreReadState()
      seen.push(state)
      return <span>{state.records.map((record) => record.sheetId).join(',') || 'empty'}</span>
    }
    const html = renderToString(
      <RatingCalculatorContextProvider>
        <Probe />
      </RatingCalculatorContextProvider>,
    )
    expect(html).toContain('empty')
    expect(html).not.toContain('dsht_e5nsvt8k2a')
    expect(seen.every((state) => !state.ready && state.records.length === 0)).toBe(true)
  })

  it('hydrates empty, then reads the save once mounted', async () => {
    const seen: ScoreReadState[] = []
    const Probe = () => {
      const state = useScoreReadState()
      const records = useScoreRecords()
      seen.push(state)
      return <span data-testid="probe">{records.map((record) => record.sheetId).join(',') || 'empty'}</span>
    }
    const tree = (
      <RatingCalculatorContextProvider>
        <Probe />
      </RatingCalculatorContextProvider>
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    document.body.appendChild(container)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    seen.length = 0
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, tree)
    })

    expect(seen[0]).toEqual({ records: [], ready: false })
    expect(seen.at(-1)).toMatchObject({
      ready: true,
      records: [expect.objectContaining({ sheetId: 'dsht_e5nsvt8k2a' })],
    })
    expect(container.textContent).toBe('dsht_e5nsvt8k2a')
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
    act(() => root!.unmount())
    container.remove()
  })

  it('is ready on the first render of a component mounted after hydration', () => {
    const { result } = renderHook(() => useScoreReadState(), { wrapper: RatingCalculatorContextProvider })
    expect(result.current.ready).toBe(true)
    expect(result.current.records.map((record) => record.sheetId)).toEqual(['dsht_e5nsvt8k2a'])
  })

  it('waits for a repository that has not loaded yet', () => {
    const repository = Object.assign(LocalScoreRepository.inMemory(SAVED as PlayEntry[]), { ready: false })
    const { result } = renderHook(() => useScoreReadState(), {
      wrapper: ({ children }) => (
        <ScoreRepositoryContext.Provider value={repository}>{children}</ScoreRepositoryContext.Provider>
      ),
    })
    expect(result.current).toEqual({ records: [], ready: false })
  })
})

describe('ScoreRepositoryOverrideProvider', () => {
  const FIXTURE = [{ sheetId: 'dsht_5mk3yr8gme', identity: IDENTITY, achievementRate: 97 }] as PlayEntry[]

  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('rating-calculator-entries', JSON.stringify(SAVED))
  })

  const renderWithOverride = (url?: string) => {
    const fixture = LocalScoreRepository.inMemory(FIXTURE)
    const view = renderHook(
      () => ({
        repository: useScoreRepository(),
        records: useScoreRecords(),
        overridden: useIsScoreRepositoryOverridden(),
      }),
      {
        wrapper: ({ children }) => (
          <RatingCalculatorContextProvider>
            <ScoreRepositoryOverrideProvider repository={fixture} url={url}>
              {children}
            </ScoreRepositoryOverrideProvider>
          </RatingCalculatorContextProvider>
        ),
      },
    )
    return { ...view, fixture }
  }

  it.each(['http://localhost:5173/rating?demoScores=1', 'https://dxrating-web.example.workers.dev/rating', undefined])(
    'replaces the repository off production (%s)',
    (url) => {
      const { result, fixture } = renderWithOverride(url)
      expect(result.current.repository).toBe(fixture)
      expect(result.current.overridden).toBe(true)
      expect(result.current.records.map((record) => record.sheetId)).toEqual(['dsht_5mk3yr8gme'])
    },
  )

  it.each([
    'https://dxrating.net/rating?demoScores=1',
    'https://www.dxrating.net/rating',
    'capacitor://localhost/rating',
  ])('is ignored on production (%s)', (url) => {
    const { result, fixture } = renderWithOverride(url)
    expect(result.current.repository).not.toBe(fixture)
    expect(result.current.overridden).toBe(false)
    expect(result.current.records.map((record) => record.sheetId)).toEqual(['dsht_e5nsvt8k2a'])
  })

  it('is ignored when there is no override', () => {
    const { result } = renderHook(() => useIsScoreRepositoryOverridden(), {
      wrapper: ({ children }) => (
        <ScoreRepositoryOverrideProvider repository={null}>{children}</ScoreRepositoryOverrideProvider>
      ),
    })
    expect(result.current).toBe(false)
  })

  it('checks hosts like ?demoScores=1', () => {
    expect(isScoreRepositoryOverrideAllowed('https://dxrating.net/')).toBe(false)
    expect(isScoreRepositoryOverrideAllowed('https://www.dxrating.net/')).toBe(false)
    expect(isScoreRepositoryOverrideAllowed('capacitor://localhost/')).toBe(false)
    expect(isScoreRepositoryOverrideAllowed('http://localhost:5173/')).toBe(true)
    expect(isScoreRepositoryOverrideAllowed('https://pr-416.dxrating.workers.dev/')).toBe(true)
  })

  it('is not applied on the server', () => {
    const fixture = LocalScoreRepository.inMemory(FIXTURE)
    const Probe = () => <span>{useIsScoreRepositoryOverridden() ? 'demo' : 'own'}</span>
    const html = renderToString(
      <ScoreRepositoryOverrideProvider repository={fixture} url="http://localhost:5173/">
        <Probe />
      </ScoreRepositoryOverrideProvider>,
    )
    expect(html).toContain('own')
  })
})