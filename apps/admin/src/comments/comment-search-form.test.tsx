import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { COMMENT_LIST_SORT, validateCommentListSearch, type CommentListFilters } from './comment-route-search'
import { CommentSearchForm, type CommentSearchFormLabels } from './comment-search-form'

const labels: CommentSearchFormLabels = {
  title: 'Filter comments',
  description: 'All filters are combined.',
  formLabel: 'Comment filters',
  authorUserId: 'Author user ID',
  authorUserIdPlaceholder: 'user-id',
  chartId: 'Stable chart ID',
  chartIdPlaceholder: 'dsht_…',
  status: 'Moderation status',
  anyStatus: 'Any status',
  activeStatus: 'Active',
  deletedStatus: 'Tombstoned',
  createdAtFromInclusive: 'Created from (inclusive)',
  createdAtBeforeExclusive: 'Created before (exclusive)',
  localTimeDescription: 'Enter local time; it is stored as an exact UTC instant.',
  clear: 'Clear filters',
  submit: 'Apply filters',
  validation: {
    authorUserId: 'Enter a valid user ID.',
    chartId: 'Enter a stable chart ID.',
    status: 'Choose a valid status.',
    createdAtFromInclusive: 'Enter a valid inclusive local time.',
    createdAtBeforeExclusive: 'Enter a valid exclusive local time.',
    dateOrder: 'The inclusive time must be earlier than the exclusive time.',
  },
}

const renderForm = ({
  disabled,
  onClear = vi.fn(),
  onSubmit = vi.fn(),
  search = validateCommentListSearch({}),
}: {
  readonly disabled?: boolean
  readonly onClear?: () => void
  readonly onSubmit?: Mock<(filters: CommentListFilters) => void>
  readonly search?: ReturnType<typeof validateCommentListSearch>
} = {}) => ({
  onClear,
  onSubmit,
  ...render(
    <MantineProvider>
      <CommentSearchForm disabled={disabled} labels={labels} onClear={onClear} onSubmit={onSubmit} search={search} />
    </MantineProvider>,
  ),
})

describe('administrator comment search form', () => {
  it('presents UTC search instants as local inputs and submits exact canonical UTC filters', async () => {
    const user = userEvent.setup()
    const from = new Date(2026, 7, 24, 9, 15).toISOString()
    const before = new Date(2026, 7, 25, 18, 45).toISOString()
    const { onSubmit } = renderForm({
      search: validateCommentListSearch({
        authorUserId: 'user-1',
        chartId: 'dsht_23456789ab',
        status: 'deleted',
        createdAtFromInclusive: from,
        createdAtBeforeExclusive: before,
        cursor: 'list_page_2',
        commentId: 42,
        threadCursor: 'thread_page_2',
      }),
    })

    expect((screen.getByLabelText(labels.createdAtFromInclusive) as HTMLInputElement).value).toBe('2026-08-24T09:15')
    expect((screen.getByLabelText(labels.createdAtBeforeExclusive) as HTMLInputElement).value).toBe('2026-08-25T18:45')
    await user.click(screen.getByRole('button', { name: labels.submit }))

    expect(onSubmit).toHaveBeenCalledWith({
      sort: COMMENT_LIST_SORT,
      authorUserId: 'user-1',
      chartId: 'dsht_23456789ab',
      status: 'deleted',
      createdAtFromInclusive: from,
      createdAtBeforeExclusive: before,
    })
    const submitted = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(submitted).not.toHaveProperty('cursor')
    expect(submitted).not.toHaveProperty('commentId')
    expect(submitted).not.toHaveProperty('threadCursor')
  })

  it('shows field-level identifier and ordered-bound errors without submitting', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.type(screen.getByLabelText(labels.authorUserId), ' invalid-user ')
    await user.type(screen.getByLabelText(labels.chartId), 'chart-123')
    fireEvent.change(screen.getByLabelText(labels.createdAtFromInclusive), {
      target: { value: '2026-08-25T09:00' },
    })
    fireEvent.change(screen.getByLabelText(labels.createdAtBeforeExclusive), {
      target: { value: '2026-08-25T08:59' },
    })
    await user.click(screen.getByRole('button', { name: labels.submit }))

    expect(screen.getByText(labels.validation.authorUserId)).toBeTruthy()
    expect(screen.getByText(labels.validation.chartId)).toBeTruthy()
    expect(screen.getByText(labels.validation.dateOrder)).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears validation while editing and clears both unsaved and URL-restored state', async () => {
    const user = userEvent.setup()
    const { onClear, onSubmit } = renderForm({
      search: validateCommentListSearch({ cursor: 'list_page_2', commentId: 42 }),
    })
    const author = screen.getByLabelText(labels.authorUserId) as HTMLInputElement
    const clear = screen.getByRole('button', { name: labels.clear }) as HTMLButtonElement

    expect(clear.disabled).toBe(false)
    await user.type(author, ' invalid ')
    await user.click(screen.getByRole('button', { name: labels.submit }))
    expect(screen.getByText(labels.validation.authorUserId)).toBeTruthy()

    await user.clear(author)
    expect(screen.queryByText(labels.validation.authorUserId)).toBeNull()
    await user.click(clear)
    expect(onClear).toHaveBeenCalledOnce()
    expect(author.value).toBe('')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('enables clearing for an unsaved draft and disables every control during navigation', async () => {
    const user = userEvent.setup()
    const first = renderForm()
    const author = screen.getByLabelText(labels.authorUserId)
    const clear = screen.getByRole('button', { name: labels.clear }) as HTMLButtonElement
    expect(clear.disabled).toBe(true)

    await user.type(author, 'unsaved-user')
    expect(clear.disabled).toBe(false)
    first.unmount()

    renderForm({ disabled: true })
    expect((screen.getByLabelText(labels.authorUserId) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText(labels.chartId) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: labels.clear }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: labels.submit }) as HTMLButtonElement).disabled).toBe(true)
  })
})