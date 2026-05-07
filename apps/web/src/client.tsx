import { StartClient } from '@tanstack/react-start/client'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { initClient } from '@/setup/init-client'

initClient()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)