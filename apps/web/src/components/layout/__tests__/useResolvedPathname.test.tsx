import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { selectDisplayedPathname, useResolvedPathname } from '../useResolvedPathname'

describe('selectDisplayedPathname', () => {
  it('follows the committed leaf match, not the pending location', () => {
    expect(
      selectDisplayedPathname({
        isLoading: true,
        location: { pathname: '/charts/trending' },
        resolvedLocation: { pathname: '/' },
        matches: [
          { routeId: '__root__', pathname: '/' },
          { routeId: '/', pathname: '/' },
        ],
      }),
    ).toBe('/')
  })

  it('falls back to the location when only the root matched (not found)', () => {
    expect(
      selectDisplayedPathname({
        isLoading: false,
        location: { pathname: '/missing' },
        resolvedLocation: { pathname: '/' },
        matches: [{ routeId: '__root__', pathname: '/' }],
      }),
    ).toBe('/missing')
  })

  it('keeps the not-found path while a navigation away from it loads', () => {
    expect(
      selectDisplayedPathname({
        isLoading: true,
        location: { pathname: '/' },
        resolvedLocation: { pathname: '/missing' },
        matches: [{ routeId: '__root__', pathname: '/' }],
      }),
    ).toBe('/missing')
  })
})

describe('useResolvedPathname with a real router', () => {
  function setup(initialPath = '/') {
    const commits: { header: string | null; page: string }[] = []
    let releaseLegal: () => void = () => {}
    let releaseHome: () => void = () => {}

    // Each page reads the header from the DOM in the commit that mounts it: the two must agree from the first frame
    function Page({ name }: { name: string }) {
      useLayoutEffect(() => {
        commits.push({ header: document.querySelector('header')?.textContent ?? null, page: name })
      }, [name])
      return <h1>{name}</h1>
    }

    function Layout() {
      const pathname = useResolvedPathname()
      return (
        <>
          <header data-testid="header">{pathname === '/' ? 'full' : 'compact'}</header>
          <Outlet />
        </>
      )
    }

    const rootRoute = createRootRoute({ component: Layout, notFoundComponent: () => <Page name="missing" /> })
    let homeLoads = 0
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      // The first load is immediate; later ones wait, so the pending state is observable
      loader: () =>
        homeLoads++ === 0 && initialPath === '/' ? undefined : new Promise<void>((resolve) => (releaseHome = resolve)),
      // Not cached, so going back waits for the loader instead of showing the cached page at once
      gcTime: 0,
      component: () => <Page name="home" />,
    })
    const legalRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/privacy-policy',
      loader: () => new Promise<void>((resolve) => (releaseLegal = resolve)),
      component: () => <Page name="legal" />,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([homeRoute, legalRoute]),
      history: createMemoryHistory({ initialEntries: [initialPath] }),
      defaultPendingMs: 1_000_000,
    })
    return { router, commits, releaseLegal: () => releaseLegal(), releaseHome: () => releaseHome() }
  }

  const expectConsistent = (commits: { header: string | null; page: string }[]) => {
    expect(commits.map((commit) => commit.page)).toEqual(['home', 'legal', 'home'])
    for (const commit of commits) expect(commit.header).toBe(commit.page === 'home' ? 'full' : 'compact')
  }

  it('keeps the header with the outgoing page until the destination renders, both ways', async () => {
    const { router, commits, releaseLegal, releaseHome } = setup()
    render(<RouterProvider router={router} />)
    await screen.findByText('home')
    expect(screen.getByTestId('header').textContent).toBe('full')

    // home → legal: while the loader is pending the home page and the full header stay
    await act(async () => {
      void router.navigate({ to: '/privacy-policy' })
    })
    expect(router.state.location.pathname).toBe('/privacy-policy')
    expect(screen.getByText('home')).toBeTruthy()
    expect(screen.getByTestId('header').textContent).toBe('full')

    await act(async () => releaseLegal())
    await screen.findByText('legal')
    expect(screen.getByTestId('header').textContent).toBe('compact')

    // legal → home (the legal page's Back): same in reverse
    await act(async () => {
      void router.navigate({ to: '/' })
    })
    expect(screen.getByText('legal')).toBeTruthy()
    expect(screen.getByTestId('header').textContent).toBe('compact')

    await act(async () => releaseHome())
    await screen.findByText('home')
    expect(screen.getByTestId('header').textContent).toBe('full')

    expectConsistent(commits)
  })

  it('keeps the not-found header until the destination renders', async () => {
    const { router, commits, releaseHome } = setup('/missing')
    render(<RouterProvider router={router} />)
    await screen.findByText('missing')
    expect(screen.getByTestId('header').textContent).toBe('compact')

    await act(async () => {
      void router.navigate({ to: '/' })
    })
    expect(screen.getByText('missing')).toBeTruthy()
    expect(screen.getByTestId('header').textContent).toBe('compact')

    await act(async () => releaseHome())
    await screen.findByText('home')
    expect(screen.getByTestId('header').textContent).toBe('full')
    expect(commits.map((commit) => [commit.page, commit.header])).toEqual([
      ['missing', 'compact'],
      ['home', 'full'],
    ])
  })

  it('switches to the not-found header in the commit that shows the not-found page', async () => {
    const { router, commits } = setup()
    render(<RouterProvider router={router} />)
    await screen.findByText('home')

    await act(async () => {
      void router.navigate({ to: '/missing' as '/' })
    })
    await screen.findByText('missing')
    expect(screen.getByTestId('header').textContent).toBe('compact')
    expect(commits.map((commit) => [commit.page, commit.header])).toEqual([
      ['home', 'full'],
      ['missing', 'compact'],
    ])
  })
})