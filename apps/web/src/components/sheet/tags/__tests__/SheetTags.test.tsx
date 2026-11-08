import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlattenedSheet } from '../../../../songs'
import { SheetTags } from '../SheetTags'

let tags: { data?: unknown[]; isLoading: boolean } = { data: [], isLoading: false }

vi.mock('../useSheetTagsDetailed', () => ({
  useSheetTagsDetailed: () => ({ ...tags, data: tags.data ?? [], mutate: vi.fn() }),
  useUserTagVotes: () => ({ data: {}, mutate: vi.fn() }),
}))
vi.mock('../../../../hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/i18n/LocaleProvider', () => ({ useLocale: () => 'en' }))
vi.mock('../SheetTagsAddButton', () => ({ SheetTagsAddButton: () => <button type="button">Add tag</button> }))

describe('SheetTags', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['no tags', { data: [], isLoading: false }],
    [
      'some tags',
      {
        data: [
          {
            id: 1,
            hidden: false,
            tag: { id: 1, localized_name: { en: 'Stamina' }, localized_description: { en: '' } },
          },
          { id: 2, hidden: true, tag: { id: 2, localized_name: { en: 'Trill' }, localized_description: { en: '' } } },
        ],
        isLoading: false,
      },
    ],
  ])('gives AnimatePresence no Fragment to put a ref on (%s)', (_, state) => {
    tags = state
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<SheetTags sheet={{ id: 'sheet' } as unknown as FlattenedSheet} />)

    expect(error.mock.calls.filter((call) => String(call[0]).includes('React.Fragment'))).toEqual([])
  })
})