import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlattenedSheet } from '../../../../songs'
import { SheetTags } from '../SheetTags'

let tags: { data?: unknown[]; isLoading: boolean } = { data: [], isLoading: false }

vi.mock('../useSheetTags', () => ({ useSheetTags: () => tags }))
vi.mock('../SheetTagsAddButton', () => ({ SheetTagsAddButton: () => <button type="button">Add tag</button> }))

describe('SheetTags', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['no tags', { data: [], isLoading: false }],
    [
      'some tags',
      { data: [{ id: 1, localized_name: { en: 'Stamina' }, localized_description: { en: '' } }], isLoading: false },
    ],
  ])('gives AnimatePresence no Fragment to put a ref on (%s)', (_, state) => {
    tags = state
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<SheetTags sheet={{ id: 'sheet' } as unknown as FlattenedSheet} />)

    expect(error.mock.calls.filter((call) => String(call[0]).includes('React.Fragment'))).toEqual([])
  })
})