import { createContext, FC, PropsWithChildren, useContext, useEffect } from 'react'
import { useList, useLocalStorage } from 'react-use'
import { ListActions } from 'react-use/lib/useList'
import { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'

export interface RatingCalculatorContext {
  entries: PlayEntry[]
  modifyEntries: ListActions<PlayEntry>
}

export const RatingCalculatorContext = createContext<RatingCalculatorContext>({
  entries: [],
  modifyEntries: {} as ListActions<PlayEntry>,
})

export const RatingCalculatorContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const [localStorageEntries, setLocalStorageEntries] = useLocalStorage<PlayEntry[]>(
    'rating-calculator-entries',
    []
  )
  const [entries, modifyEntries] = useList<PlayEntry>(localStorageEntries)

  useEffect(() => {
    setLocalStorageEntries(entries)
  }, [entries, setLocalStorageEntries])

  return (
    <RatingCalculatorContext.Provider value={{ entries, modifyEntries }}>
      {children}
    </RatingCalculatorContext.Provider>
  )
}

export const useRatingCalculatorContext = () => {
  const context = useContext(RatingCalculatorContext)
  if (!context) {
    throw new Error('Missing RatingCalculatorContextProvider')
  }
  return context
}
