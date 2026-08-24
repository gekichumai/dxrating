import { fireEvent, render, screen } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { createAdminTestRuntime } from '../test/render-admin-app'
import { OperationalRefresh, type ManualRefreshResult } from './operational-refresh'

const renderRefresh = ({
  dataUpdatedAt = 0,
  isFetching = false,
  onRefresh,
}: {
  dataUpdatedAt?: number
  isFetching?: boolean
  onRefresh: () => Promise<ManualRefreshResult>
}) =>
  render(
    <AdminProviders>
      <OperationalRefresh dataUpdatedAt={dataUpdatedAt} isFetching={isFetching} onRefresh={onRefresh} />
    </AdminProviders>,
  )

describe('operational manual refresh', () => {
  it('shows the last successful query timestamp', () => {
    const timestamp = Date.UTC(2026, 7, 24, 12, 30, 0)
    renderRefresh({ dataUpdatedAt: timestamp, onRefresh: vi.fn() })

    const time = screen.getByText(/Last updated/).closest('time')
    expect(time?.getAttribute('datetime')).toBe('2026-08-24T12:30:00.000Z')
  })

  it('performs a real refresh even when information already has a successful timestamp', async () => {
    const onRefresh = vi.fn().mockResolvedValue({ status: 'success' })
    renderRefresh({ dataUpdatedAt: Date.now(), onRefresh })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(onRefresh).toHaveBeenCalledOnce()
    expect((await screen.findByText('Information refreshed.')).tagName).toBe('OUTPUT')
  })

  it('announces failure while leaving the consumer-owned information mounted', async () => {
    const Consumer = () => {
      const [value] = useState('Existing operational result')
      return (
        <AdminProviders>
          <div>{value}</div>
          <OperationalRefresh
            dataUpdatedAt={Date.now()}
            isFetching={false}
            onRefresh={async () => ({ status: 'error' })}
          />
        </AdminProviders>
      )
    }
    render(<Consumer />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect((await screen.findByText('Refresh failed. Existing information is still shown.')).tagName).toBe('OUTPUT')
    expect(screen.getByText('Existing operational result')).toBeTruthy()
  })

  it('does not start another refresh while one is already in progress', () => {
    const onRefresh = vi.fn()
    renderRefresh({ isFetching: true, onRefresh })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('uses TanStack refetch while fresh and retains successful data and its timestamp after failure', async () => {
    const queryFn = vi.fn().mockResolvedValueOnce('Existing query data').mockRejectedValueOnce(new Error('offline'))
    const runtime = createAdminTestRuntime()
    const QueryConsumer = () => {
      const query = useQuery({
        queryFn,
        queryKey: ['admin', 'manual-refresh-integration'],
        staleTime: Number.POSITIVE_INFINITY,
      })
      return (
        <>
          <div>{query.data}</div>
          <OperationalRefresh
            dataUpdatedAt={query.dataUpdatedAt}
            isFetching={query.isFetching}
            onRefresh={query.refetch}
          />
        </>
      )
    }
    render(
      <AdminProviders runtime={runtime}>
        <QueryConsumer />
      </AdminProviders>,
    )

    expect(await screen.findByText('Existing query data')).toBeTruthy()
    const successfulTimestamp = screen
      .getByText(/Last updated/)
      .closest('time')
      ?.getAttribute('datetime')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText('Refresh failed. Existing information is still shown.')).toBeTruthy()
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Existing query data')).toBeTruthy()
    expect(
      screen
        .getByText(/Last updated/)
        .closest('time')
        ?.getAttribute('datetime'),
    ).toBe(successfulTimestamp)
  })

  it('clears a stale failure announcement after a later successful update advances', async () => {
    const onRefresh = vi.fn().mockResolvedValue({ isError: true })
    const initialTimestamp = Date.now()
    const rendered = renderRefresh({ dataUpdatedAt: initialTimestamp, onRefresh })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Refresh failed. Existing information is still shown.')).toBeTruthy()

    rendered.rerender(
      <AdminProviders>
        <OperationalRefresh dataUpdatedAt={initialTimestamp + 1_000} isFetching={false} onRefresh={onRefresh} />
      </AdminProviders>,
    )

    expect(screen.queryByText('Refresh failed. Existing information is still shown.')).toBeNull()
  })
})