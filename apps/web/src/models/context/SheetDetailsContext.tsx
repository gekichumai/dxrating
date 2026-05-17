import { createContext, type FC, type PropsWithChildren } from 'react'

export interface SheetDetailsContext {
  queryActive: boolean
}

export const SheetDetailsContext = createContext<SheetDetailsContext>({
  queryActive: false,
})

export const SheetDetailsContextProvider: FC<PropsWithChildren<{ queryActive: boolean }>> = ({
  children,
  queryActive,
}) => {
  return <SheetDetailsContext.Provider value={{ queryActive }}>{children}</SheetDetailsContext.Provider>
}