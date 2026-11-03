import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CloudSaveDemoBoundary, requestedCloudSaveDemo } from '../CloudSaveDemoBoundary'
import { useCloudSaveStatus, useCloudSaveUi } from '../CloudSaveUiContext'
import { useScoreRepository } from '../useScoreRepository'

const Probe = () => {
  const ui = useCloudSaveUi()
  const status = useCloudSaveStatus()
  const repository = useScoreRepository()
  return (
    <output>
      {ui ? `cloud:${ui.controller.saveId}:${status?.state}` : 'local'} {repository.kind}
    </output>
  )
}

describe('cloud save demo (?demoCloudSave=1)', () => {
  it('is honoured on dev and preview hosts only', () => {
    expect(requestedCloudSaveDemo('http://localhost:5173/rating?demoCloudSave=1')).toBe('idle')
    expect(
      requestedCloudSaveDemo('https://pr-416.dxrating.workers.dev/rating?demoCloudSave=1&demoCloudSaveState=offline'),
    ).toBe('offline')
    expect(requestedCloudSaveDemo('http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveState=bogus')).toBe('idle')
    expect(requestedCloudSaveDemo('http://localhost:5173/rating')).toBeNull()
    expect(requestedCloudSaveDemo('https://dxrating.net/rating?demoCloudSave=1')).toBeNull()
    expect(requestedCloudSaveDemo('https://www.dxrating.net/rating?demoCloudSave=1')).toBeNull()
    expect(requestedCloudSaveDemo('capacitor://localhost/rating?demoCloudSave=1')).toBeNull()
  })

  it('swaps in the demo cloud save on a dev host', async () => {
    render(
      <CloudSaveDemoBoundary url="http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveState=syncing">
        <Probe />
      </CloudSaveDemoBoundary>,
    )
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('cloud:dsav_demo_main:syncing cloud'))
  })

  it('changes nothing on the production host', async () => {
    render(
      <CloudSaveDemoBoundary url="https://dxrating.net/rating?demoCloudSave=1">
        <Probe />
      </CloudSaveDemoBoundary>,
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('status').textContent).toBe('local local')
  })
})