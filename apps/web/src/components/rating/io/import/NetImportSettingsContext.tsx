import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { NetImportSettingsDialog } from './NetImportSettingsDialog'

interface NetImportSettingsState {
  isOpen: boolean
  openSettings: (returnFocus?: HTMLElement | null) => void
  closeSettings: () => void
}

const NetImportSettingsContext = createContext<NetImportSettingsState | null>(null)

export function NetImportSettingsProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const openSettings = useCallback((returnFocus?: HTMLElement | null) => {
    returnFocusRef.current = returnFocus ?? null
    setIsOpen(true)
  }, [])
  const closeSettings = useCallback(() => setIsOpen(false), [])
  const value = useMemo(() => ({ isOpen, openSettings, closeSettings }), [isOpen, openSettings, closeSettings])

  return (
    <NetImportSettingsContext.Provider value={value}>
      {children}
      <NetImportSettingsDialog
        open={isOpen}
        onClose={closeSettings}
        onExited={() => {
          if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true })
        }}
      />
    </NetImportSettingsContext.Provider>
  )
}

export function useNetImportSettings() {
  const context = useContext(NetImportSettingsContext)
  if (!context) throw new Error('Missing NetImportSettingsProvider')
  return context
}