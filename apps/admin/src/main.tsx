import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './styles/global.css'

import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AdminProviders } from './providers'
import { adminRouter } from './router'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Admin application root element is missing')

createRoot(rootElement).render(
  <StrictMode>
    <AdminProviders>
      <RouterProvider router={adminRouter} />
    </AdminProviders>
  </StrictMode>,
)