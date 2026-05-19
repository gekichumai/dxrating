import { AppContextProvider } from '@/models/context/AppContext'
import { initI18n } from '@/setup/init-i18n'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TopBar } from '../TopBar'

vi.mock('~icons/mdi/github', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('~icons/simple-icons/discord', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('../../global/Logo', () => ({
  Logo: () => <div>DXRating.net</div>,
}))

vi.mock('../../global/preferences/LocaleSelector', () => ({
  LocaleSelector: () => <button type="button" aria-label="Language" />,
}))

vi.mock('../../global/preferences/UserChip', () => ({
  UserChip: () => <button type="button" aria-label="User profile" />,
}))

vi.mock('../../global/site-meta/About', () => ({
  About: () => <button type="button" aria-label="About DXRating" />,
}))

vi.mock('../../../utils/bundle', () => ({
  BUNDLE: {
    version: 'v1.6.138',
    buildTime: new Date('2026-05-18T15:50:00.000Z'),
  },
}))

describe('TopBar', () => {
  beforeAll(() => {
    initI18n()
  })

  it('names icon-only community links for assistive technology', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(screen.getByRole('link', { name: 'Join the DXRating Discord server' }).getAttribute('href')).toBe(
      'https://discord.gg/8CFgUPxyrU',
    )
    expect(screen.getByRole('link', { name: 'Open DXRating on GitHub' }).getAttribute('href')).toBe(
      'https://github.com/gekichumai/dxrating',
    )
  })

  it('uses a higher contrast version stamp over the themed header color', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(screen.getByText(/v1\.6\.138/).className).toContain('text-black/75')
  })
})