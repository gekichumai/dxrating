import { ADMIN_CONTRACT_COMPATIBILITY_ID } from '@gekichumai/admin-contract'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAdminTestRuntime, renderAdminApp } from '../test/render-admin-app'

const bootstrapOutput = {
  contractCompatibilityId: ADMIN_CONTRACT_COMPATIBILITY_ID,
  ready: true as const,
  principal: {
    userId: 'administrator-id',
    effectiveRole: 'admin' as const,
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    },
  },
}

describe('dashboard data controls', () => {
  it('mounts the operational refresh affordance against the real bootstrap query', async () => {
    const fetch = vi.fn(async () => Response.json(bootstrapOutput))
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })

    await renderAdminApp('/', { runtime })

    expect(await screen.findByText(/Last updated/)).toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Information refreshed.')).toBeTruthy()
  })
})