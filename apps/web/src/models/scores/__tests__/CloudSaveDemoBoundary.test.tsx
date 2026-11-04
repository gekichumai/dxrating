import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../../../setup/init-i18n'
import { CloudSaveDemoBoundary, requestedCloudSaveDemo, requestedCloudSaveDemoFlow } from '../CloudSaveDemoBoundary'
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

beforeAll(async () => {
  initI18n()
  await i18n.changeLanguage('en')
})

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

  it('opens the migration and opt-in flows for screenshots, on dev and preview hosts only', async () => {
    expect(requestedCloudSaveDemoFlow('http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveFlow=migrate')).toBe(
      'migrate',
    )
    expect(
      requestedCloudSaveDemoFlow('http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveFlow=bogus'),
    ).toBeNull()
    expect(requestedCloudSaveDemoFlow('http://localhost:5173/rating?demoCloudSaveFlow=migrate')).toBeNull()
    expect(
      requestedCloudSaveDemoFlow('https://dxrating.net/rating?demoCloudSave=1&demoCloudSaveFlow=opt-in'),
    ).toBeNull()

    const migrate = render(
      <CloudSaveDemoBoundary url="http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveFlow=migrate-existing">
        <Probe />
      </CloudSaveDemoBoundary>,
    )
    const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 })
    await within(dialog).findByText('You already have a cloud save')
    // Its requests stay in memory: merging finishes without a network
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }))
    await within(dialog).findByText('Backed up', {}, { timeout: 3000 })
    migrate.unmount()

    render(
      <CloudSaveDemoBoundary url="http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveFlow=opt-in">
        <Probe />
      </CloudSaveDemoBoundary>,
    )
    expect(await screen.findByRole('dialog', { name: 'Turn on cloud save (beta)?' }, { timeout: 3000 })).toBeTruthy()
  })

  it('opens "Use a cloud save" over the demo saves, on an empty local save (choose-save)', async () => {
    expect(
      requestedCloudSaveDemoFlow('http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveFlow=choose-save'),
    ).toBe('choose-save')
    expect(
      requestedCloudSaveDemoFlow('https://dxrating.net/rating?demoCloudSave=1&demoCloudSaveFlow=choose-save'),
    ).toBeNull()

    render(
      <CloudSaveDemoBoundary url="http://localhost:5173/rating?demoCloudSave=1&demoCloudSaveFlow=choose-save">
        <Probe />
      </CloudSaveDemoBoundary>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Choose a cloud save' }, { timeout: 3000 })
    expect((await within(dialog).findAllByRole('button')).length).toBeGreaterThan(1)
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('local local')
  })
})