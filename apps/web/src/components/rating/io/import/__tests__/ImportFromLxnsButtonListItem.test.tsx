import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ServerImportFailedError } from '@/models/scores/cloudImports'
import { initI18n } from '@/setup/init-i18n'
import { ImportFromLxnsButtonListItem } from '../ImportFromLxnsButtonListItem'

const mocks = vi.hoisted(() => ({
  serverImport: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: mocks.toastError, dismiss: vi.fn() }),
}))
vi.mock('web-haptics', () => ({
  WebHaptics: class {
    trigger() {}
  },
}))
vi.mock('@sentry/tanstackstart-react', () => ({
  metrics: { count: vi.fn(), distribution: vi.fn() },
}))
vi.mock('../../../../../hooks/useAuth', () => ({ useAuth: () => ({ isAuthenticated: true }) }))
vi.mock('../../../../../lib/orpc', () => ({
  apiClient: { lxns: { status: vi.fn(async () => ({ connected: true })) } },
}))
vi.mock('@/catalog/CatalogContext', () => ({ useSongCatalogLoader: () => async () => ({}) }))
vi.mock('@/models/scores/useScoreRepository', () => ({ useScoreRepository: () => ({ kind: 'cloud' }) }))
vi.mock('../cloudImport', async (original) => ({
  ...(await original<typeof import('../cloudImport')>()),
  importPath: () => 'server',
  runServerImportToEnd: mocks.serverImport,
}))

beforeAll(async () => {
  initI18n()
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openAndImport() {
  render(<ImportFromLxnsButtonListItem onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('Import from LXNS (落雪咖啡屋)'))
  fireEvent.click(await screen.findByRole('button', { name: 'Import now' }))
}

describe('ImportFromLxnsButtonListItem on a cloud save', () => {
  it('offers to connect again when the server import lost the LXNS connection', async () => {
    mocks.serverImport.mockRejectedValue(new ServerImportFailedError('connection_expired', null))
    await openAndImport()

    expect(await screen.findByRole('button', { name: 'Connect to LXNS' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Import now' })).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Your LXNS connection has expired. Reconnect your account to keep importing.',
    )
  })

  it('stays connected after a provider failure that keeps the connection', async () => {
    mocks.serverImport.mockRejectedValue(new ServerImportFailedError('upstream_error', null))
    await openAndImport()

    expect(await screen.findByRole('button', { name: 'Import now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect to LXNS' })).toBeNull()
  })
})