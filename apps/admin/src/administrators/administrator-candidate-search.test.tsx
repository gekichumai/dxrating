import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { createAdminTestRuntime } from '../test/render-admin-app'
import {
  AdministratorCandidateSearch,
  type AdministratorCandidate,
  type AdministratorCandidateSearchLabels,
} from './administrator-candidate-search'

const labels: AdministratorCandidateSearchLabels = {
  title: 'Find an administrator candidate',
  description: 'Search ordinary, unbanned accounts.',
  existingAccountsOnly: 'Only existing accounts are listed. Email verification is informational.',
  formLabel: 'Candidate search',
  searchBy: 'Search by',
  searchByUserId: 'Stable user ID',
  searchByEmail: 'Email address',
  searchByDisplayName: 'Display-name prefix',
  query: 'Search value',
  userIdPlaceholder: 'user-id',
  emailPlaceholder: 'person@example.test',
  displayNamePlaceholder: 'Display name',
  required: 'Enter a search value.',
  invalidUserId: 'Enter a valid user ID.',
  invalidEmail: 'Enter a valid email address.',
  invalidDisplayName: 'Enter at least two display-name characters.',
  submit: 'Search candidates',
  loading: 'Loading candidates',
  empty: 'No eligible candidates found.',
  resultsCaption: 'Eligible existing accounts',
  tableRegion: 'Scrollable candidate results',
  identity: 'Identity',
  email: 'Email',
  verification: 'Email verification',
  verified: 'Verified',
  notVerified: 'Not verified',
  select: 'Select candidate',
  selected: 'Candidate selected',
  backToNewest: 'Back to first page',
  older: 'More candidates',
}

const candidates = [
  {
    userId: 'candidate-1',
    displayName: 'Candidate One',
    email: 'one@example.test',
    emailVerified: false,
    effectiveRole: 'user' as const,
    accountStatus: { status: 'active' as const },
  },
  {
    userId: 'candidate-2',
    displayName: 'Candidate Two',
    email: 'two@example.test',
    emailVerified: true,
    effectiveRole: 'user' as const,
    accountStatus: { status: 'active' as const },
  },
] satisfies AdminContractOutputs['searchUsers']['items']

const renderSearch = ({
  disabled,
  fetch = vi.fn(async () => Response.json({ items: candidates, nextCursor: null })),
  onSelect = vi.fn<(candidate: AdministratorCandidate) => void>(),
  onSelectionInvalidated = vi.fn<() => void>(),
  selectedUserId,
}: {
  readonly disabled?: boolean
  readonly fetch?: ReturnType<typeof vi.fn<(request: RequestInfo | URL) => Promise<Response>>>
  readonly onSelect?: (candidate: AdministratorCandidate) => void
  readonly onSelectionInvalidated?: () => void
  readonly selectedUserId?: string
} = {}) => {
  const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
  return {
    fetch,
    onSelect,
    onSelectionInvalidated,
    ...render(
      <AdminProviders runtime={runtime}>
        <AdministratorCandidateSearch
          disabled={disabled}
          labels={labels}
          limit={10}
          onSelect={onSelect}
          onSelectionInvalidated={onSelectionInvalidated}
          selectedUserId={selectedUserId}
        />
      </AdminProviders>,
    ),
  }
}

const submitDefaultSearch = async (value = 'candidate-1') => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(labels.query), value)
  await user.click(screen.getByRole('button', { name: labels.submit }))
}

describe('administrator candidate search', () => {
  it('stays lazy until a valid search and never exposes administrator or ban filters', async () => {
    const rendered = renderSearch()

    expect(rendered.fetch).not.toHaveBeenCalled()
    expect(screen.getByText(labels.existingAccountsOnly)).toBeTruthy()
    expect(screen.queryByLabelText(/role/i)).toBeNull()
    expect(screen.queryByLabelText(/ban/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: labels.submit }))
    expect(screen.getByText(labels.required)).toBeTruthy()
    expect(rendered.fetch).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(labels.query), { target: { value: ' invalid ' } })
    fireEvent.click(screen.getByRole('button', { name: labels.submit }))
    expect(screen.getByText(labels.invalidUserId)).toBeTruthy()
    expect(rendered.fetch).not.toHaveBeenCalled()
  })

  it('forces ordinary-role and unbanned filters and permits selecting an unverified existing account', async () => {
    const { fetch, onSelect } = renderSearch()
    await submitDefaultSearch()

    expect(await screen.findByText('Candidate One')).toBeTruthy()
    expect(screen.getByText(labels.notVerified)).toBeTruthy()
    expect(screen.getByText(labels.verified)).toBeTruthy()
    expect(screen.getByRole('region', { name: labels.tableRegion }).getAttribute('tabindex')).toBe('0')
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    const request = fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    expect(new URL((request as Request).url).pathname).toBe('/api/admin/users/search')
    await expect((request as Request).clone().json()).resolves.toEqual({
      userId: 'candidate-1',
      effectiveRole: 'user',
      activeBan: false,
      limit: 10,
    })

    const firstRow = screen.getByText('Candidate One').closest('tr')
    expect(firstRow).not.toBeNull()
    fireEvent.click(within(firstRow!).getByRole('button', { name: `${labels.select}: Candidate One (candidate-1)` }))
    expect(onSelect).toHaveBeenCalledWith(candidates[0])
  })

  it('invalidates a selected snapshot when refreshed eligible results no longer contain it', async () => {
    const onSelectionInvalidated = vi.fn()
    renderSearch({
      fetch: vi.fn(async () => Response.json({ items: candidates.slice(1), nextCursor: null })),
      onSelectionInvalidated,
      selectedUserId: 'candidate-1',
    })

    await submitDefaultSearch()
    await screen.findByText('Candidate Two')
    await waitFor(() => expect(onSelectionInvalidated).toHaveBeenCalledTimes(2))
  })

  it('marks the selected account without making verification an eligibility gate', async () => {
    renderSearch({ selectedUserId: 'candidate-1' })
    await submitDefaultSearch()

    const selected = await screen.findByRole('button', { name: `${labels.selected}: Candidate One (candidate-1)` })
    expect((selected as HTMLButtonElement).disabled).toBe(true)
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    expect(
      (screen.getByRole('button', { name: `${labels.select}: Candidate Two (candidate-2)` }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('uses stable IDs to distinguish actions for duplicate display names', async () => {
    renderSearch({
      fetch: vi.fn(async () =>
        Response.json({
          items: candidates.map((candidate) => ({ ...candidate, displayName: 'Alex' })),
          nextCursor: null,
        }),
      ),
    })
    await submitDefaultSearch()

    expect(await screen.findByRole('button', { name: `${labels.select}: Alex (candidate-1)` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${labels.select}: Alex (candidate-2)` })).toBeTruthy()
  })

  it('uses opaque keyset cursors and resets to the first page without changing eligibility filters', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      const body = (await request.clone().json()) as { cursor?: string }
      return Response.json(
        body.cursor
          ? { items: candidates.slice(1), nextCursor: null }
          : { items: candidates.slice(0, 1), nextCursor: 'candidate_page_2' },
      )
    })
    renderSearch({ fetch })
    await submitDefaultSearch('candidate')

    fireEvent.click(await screen.findByRole('button', { name: labels.older }))
    expect(await screen.findByText('Candidate Two')).toBeTruthy()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const secondRequest = fetch.mock.calls[1]![0] as Request
    await expect(secondRequest.clone().json()).resolves.toEqual({
      userId: 'candidate',
      effectiveRole: 'user',
      activeBan: false,
      cursor: 'candidate_page_2',
      limit: 10,
    })

    fireEvent.click(screen.getByRole('button', { name: labels.backToNewest }))
    expect(await screen.findByText('Candidate One')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: labels.older }))
    expect(await screen.findByText('Candidate Two')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: labels.submit }))
    expect(await screen.findByText('Candidate One')).toBeTruthy()
    expect(screen.queryByRole('button', { name: labels.backToNewest })).toBeNull()
  })

  it('changes search mode explicitly and canonicalizes exact email searches', async () => {
    const user = userEvent.setup()
    const rendered = renderSearch()

    await user.click(screen.getByRole('combobox', { name: labels.searchBy }))
    await user.click(await screen.findByRole('option', { hidden: true, name: labels.searchByEmail }))
    await user.type(screen.getByLabelText(labels.query), '  PERSON@EXAMPLE.TEST  ')
    await user.click(screen.getByRole('button', { name: labels.submit }))

    await waitFor(() => expect(rendered.fetch).toHaveBeenCalledOnce())
    const request = rendered.fetch.mock.calls[0]![0] as Request
    await expect(request.clone().json()).resolves.toEqual({
      email: 'person@example.test',
      effectiveRole: 'user',
      activeBan: false,
      limit: 10,
    })
  })

  it('renders empty and redacted transport states and disables every selection control on demand', async () => {
    const empty = renderSearch({
      disabled: true,
      fetch: vi.fn(async () => Response.json({ items: [], nextCursor: null })),
    })
    expect((screen.getByRole('combobox', { name: labels.searchBy }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText(labels.query) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: labels.submit }) as HTMLButtonElement).disabled).toBe(true)
    empty.unmount()

    const noResults = renderSearch({ fetch: vi.fn(async () => Response.json({ items: [], nextCursor: null })) })
    await submitDefaultSearch()
    expect(await screen.findByText(labels.empty)).toBeTruthy()
    noResults.unmount()

    const failed = renderSearch({
      fetch: vi.fn(async () => {
        throw new TypeError('private transport detail')
      }),
    })
    await submitDefaultSearch()
    expect((await screen.findByRole('alert')).textContent).toContain('Connection failed')
    expect(document.body.textContent).not.toContain('private transport detail')
    failed.unmount()
  })
})