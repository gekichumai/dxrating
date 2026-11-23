import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResponsiveDialog } from '../ResponsiveDialog'

const largeDevice = vi.hoisted(() => ({ value: false }))
vi.mock('../../../utils/breakpoints', () => ({ useIsLargeDevice: () => largeDevice.value }))

const renderDialog = (props: { title?: string; hideCloseButton?: boolean } = {}) =>
  render(
    <ResponsiveDialog open setOpen={() => {}} labelledBy={props.title ? undefined : 'heading'} {...props}>
      {() => <h2 id="heading">Sign in</h2>}
    </ResponsiveDialog>,
  )

describe('ResponsiveDialog', () => {
  afterEach(cleanup)

  // The sign-in sheet names itself with its own heading: it had no close button on phones
  it('shows a close button on a phone without a title', async () => {
    largeDevice.value = false
    renderDialog()
    expect(await screen.findByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('leaves the close button out when the content renders its own', async () => {
    largeDevice.value = false
    renderDialog({ hideCloseButton: true })
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})