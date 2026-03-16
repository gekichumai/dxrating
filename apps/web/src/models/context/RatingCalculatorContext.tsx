import { createContext, type FC, type PropsWithChildren, useContext, useEffect } from 'react'
import { useList } from 'react-use'
import type { ListActions } from 'react-use/lib/useList'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'

export interface RatingCalculatorContext {
  entries: PlayEntry[]
  modifyEntries: ListActions<PlayEntry>
}

export const RatingCalculatorContext = createContext<RatingCalculatorContext>({
  entries: [],
  modifyEntries: {} as ListActions<PlayEntry>,
})

function readEntriesFromLocalStorage(): PlayEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('rating-calculator-entries')
    if (stored) return JSON.parse(stored) as PlayEntry[]
  } catch {}
  return []
}

export const RatingCalculatorContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const [entries, modifyEntries] = useList<PlayEntry>(readEntriesFromLocalStorage)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rating-calculator-entries', JSON.stringify(entries))
    }
  }, [entries])

  return (
    <RatingCalculatorContext.Provider value={{ entries, modifyEntries }}>{children}</RatingCalculatorContext.Provider>
  )
}

export const useRatingCalculatorContext = () => {
  const context = useContext(RatingCalculatorContext)
  if (!context) {
    throw new Error('Missing RatingCalculatorContextProvider')
  }
  return context
}