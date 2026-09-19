import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { filterComments, hideComment, useCommentVisibility } from './commentVisibility'

const comments = [
  { id: 1, author_id: 'a' },
  { id: 2, author_id: 'a' },
  { id: 3, author_id: 'b' },
]
describe('comment visibility', () => {
  it('hides exactly the reported comment across mounted and late-loading views and isolates accounts', () => {
    const one = renderHook(() => useCommentVisibility('report-viewer'))
    const two = renderHook(() => useCommentVisibility('report-viewer'))
    const other = renderHook(() => useCommentVisibility('other-viewer'))
    act(() => {
      hideComment('report-viewer', 1)
    })
    expect(filterComments(comments, one.result.current).map((c) => c.id)).toEqual([2, 3])
    expect(filterComments([...comments], two.result.current).map((c) => c.id)).toEqual([2, 3])
    expect(filterComments(comments, other.result.current)).toEqual(comments)
  })
  it('blocks all author comments, filters stale responses and rolls back failure', () => {
    const hook = renderHook(() => useCommentVisibility('block-viewer'))
    let undo!: () => void
    act(() => {
      undo = hideComment('block-viewer', 1, 'a')
    })
    expect(filterComments(comments, hook.result.current).map((c) => c.id)).toEqual([3])
    expect(filterComments([...comments, { id: 4, author_id: 'a' }], hook.result.current).map((c) => c.id)).toEqual([3])
    act(undo)
    expect(filterComments(comments, hook.result.current)).toEqual(comments)
  })
})