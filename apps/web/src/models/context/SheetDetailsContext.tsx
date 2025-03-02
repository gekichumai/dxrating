import { createContext, type FC, type PropsWithChildren, useState } from 'react'

export interface SheetDetailsContext {
  queryActive: boolean
  setQueryActive: (active: boolean) => void
}

export const SheetDetailsContext = createContext<SheetDetailsContext>({
  queryActive: false,
  setQueryActive: () => {
    throw new Error('SheetDetailsContext not initialized')
  },
})

export const SheetDetailsContextProvider: FC<PropsWithChildren<object>> = ({ children }) => {
  const [queryActive, setQueryActive] = useState(false)
  return <SheetDetailsContext.Provider value={{ queryActive, setQueryActive }}>{children}</SheetDetailsContext.Provider>
}
