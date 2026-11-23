import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NavigationOriginTracker } from '@/components/layout/navigationOrigins'
import { BackToHomeLink } from '../BackToHomeLink'

const setup = (initialEntry: string) => {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <NavigationOriginTracker />
        <Outlet />
      </>
    ),
  })
  const page = (path: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <main>
          <h1>{path}</h1>
          <BackToHomeLink />
        </main>
      ),
    })
  const history = createMemoryHistory({ initialEntries: [initialEntry] })
  const router = createRouter({ routeTree: rootRoute.addChildren([page('/'), page('/charts/new')]), history })
  render(<RouterProvider router={router} />)
  const go = async (to: string) => {
    await act(async () => {
      await router.navigate({ href: to })
    })
    await screen.findByRole('heading', { name: to.split('?')[0] })
  }
  return { router, history, go }
}

describe('BackToHomeLink', () => {
  it('is not offered on a page opened directly', async () => {
    setup('/charts/new')
    await screen.findByRole('heading', { name: '/charts/new' })
    expect(screen.queryByRole('link', { name: 'Back to home' })).toBeNull()
  })

  it('is not offered on a page reached from somewhere other than Home', async () => {
    const { go } = setup('/charts/new?page=2')
    await screen.findByRole('heading', { name: '/charts/new' })
    await go('/charts/new?page=3')
    expect(screen.queryByRole('link', { name: 'Back to home' })).toBeNull()
  })

  it('links to the Home it came from, search included', async () => {
    const { go } = setup('/?q=tetoris')
    await screen.findByRole('heading', { name: '/' })
    await go('/charts/new')

    const link = await screen.findByRole('link', { name: 'Back to home' })
    expect(link.getAttribute('href')).toBe('/?q=tetoris')
    expect(link.textContent).toBe('Home')
  })

  it('goes back to that Home entry on a plain click, instead of pushing a new one', async () => {
    const { router, history, go } = setup('/?q=tetoris')
    await screen.findByRole('heading', { name: '/' })
    await go('/charts/new')

    await act(async () => {
      fireEvent.click(await screen.findByRole('link', { name: 'Back to home' }), { button: 0 })
    })

    await screen.findByRole('heading', { name: '/' })
    expect(history.canGoBack()).toBe(false)
    expect(router.state.location.href).toBe('/?q=tetoris')
  })

  it('leaves a modified click to the browser (new tab)', async () => {
    const { history, go } = setup('/')
    await screen.findByRole('heading', { name: '/' })
    await go('/charts/new')

    const link = await screen.findByRole('link', { name: 'Back to home' })
    const click = fireEvent.click(link, { button: 0, metaKey: true })

    expect(click).toBe(true)
    expect(history.length).toBe(2)
    expect(screen.getByRole('heading', { name: '/charts/new' })).toBeTruthy()
  })
})