import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlattenedSheet } from '@/songs'
import { SongHeader } from '../SongHeader'

const aliases = vi.hoisted(() => ({ state: {} as { data?: unknown; error?: unknown } }))
vi.mock('@/models/useServerAliases', () => ({ useServerAliases: () => aliases.state }))
vi.mock('../../sheet/AddSheetAltNameButton', () => ({ AddSheetAltNameButton: () => null }))
vi.mock('../../sheet/SheetAltNames', () => ({
  SheetAltNames: ({ altNames }: { altNames: string[] }) => <div data-testid="alt-names">{altNames.join(',')}</div>,
}))

const sheet = (searchAcronyms: string[]) =>
  ({
    songId: 'dsng_test',
    title: 'Song',
    artist: 'Artist',
    category: 'POPS',
    searchAcronyms,
  }) as unknown as FlattenedSheet

const slot = () => screen.getByText('Artist').parentElement!.querySelector('.h-5')

describe('SongHeader aliases', () => {
  afterEach(cleanup)

  it('holds one line with a placeholder while the community aliases load (as on the server)', () => {
    aliases.state = {}
    render(<SongHeader sheet={sheet([])} />)
    expect(slot()).not.toBeNull()
    expect(slot()!.textContent).toBe('')
  })

  it('says so when a song has no aliases', () => {
    aliases.state = { data: [] }
    render(<SongHeader sheet={sheet([])} />)
    expect(slot()!.textContent).toBe('No aliases yet')
  })

  it('keeps the line empty when the aliases fail to load', () => {
    aliases.state = { error: new Error('down') }
    render(<SongHeader sheet={sheet([])} />)
    expect(slot()!.textContent).toBe('')
  })

  it('shows the aliases in place of the held line', () => {
    aliases.state = { data: [] }
    render(<SongHeader sheet={sheet(['alias'])} />)
    expect(screen.getByTestId('alt-names').textContent).toBe('alias')
    expect(slot()).toBeNull()
  })
})