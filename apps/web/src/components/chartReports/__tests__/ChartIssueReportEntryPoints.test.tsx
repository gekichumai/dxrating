import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import type { FlattenedSheet } from '@/songs'
import { SheetDialogContent } from '../../sheet/SheetDialogContent'
import { SongSheetContent } from '../../song/SongSheetContent'

vi.mock('../ChartIssueReportButton', () => ({
  ChartIssueReportButton: ({ sheet }: { sheet: FlattenedSheet }) => (
    <button type="button" data-testid="chart-report-entry" data-song-id={sheet.songId} data-chart-id={sheet.id}>
      report entry
    </button>
  ),
}))

vi.mock('../../sheet/SheetDialogContentHeader', () => ({
  SheetDialogContentHeader: () => <div data-testid="sheet-header" />,
}))

vi.mock('../../sheet/SheetListItem', () => ({
  SheetDifficulty: () => <span data-testid="sheet-difficulty" />,
  SheetTitle: ({ sheet }: { sheet: FlattenedSheet }) => <h2>{sheet.title}</h2>,
}))

vi.mock('../../sheet/tags/SheetTags', () => ({
  SheetTags: () => <div data-testid="sheet-tags" />,
}))

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { id: 'session-1' },
    ensureAuthenticated: vi.fn(async () => true),
    openLoginDialog: vi.fn(),
    LoginDialog: () => null,
  }),
}))

vi.mock('../../../models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => VersionEnum.CiRCLEPLUS,
}))

vi.mock('swr', () => ({
  default: () => ({ data: [], isLoading: false, mutate: vi.fn() }),
}))

const sheet: FlattenedSheet = {
  id: 'legacy-song:utage:master',
  songId: 'legacy-song',
  identity: {
    songId: 'legacy-song',
    type: TypeEnum.UTAGE,
    difficulty: DifficultyEnum.Master,
  },
  title: 'Example Song',
  artist: 'Example Artist',
  category: CategoryEnum.Maimai,
  bpm: 180,
  imageName: 'example-song',
  isNew: false,
  isLocked: false,
  sheets: [],
  searchAcronyms: [],
  type: TypeEnum.UTAGE,
  difficulty: DifficultyEnum.Master,
  level: '宴',
  internalLevelValue: 0,
  noteDesigner: null,
  noteCounts: {
    tap: null,
    hold: null,
    slide: null,
    touch: null,
    break: null,
    total: null,
  },
  regions: { jp: true, intl: false, cn: false },
  version: VersionEnum.CiRCLEPLUS,
  isSpecial: true,
  isTypeUtage: true,
  isRatingEligible: false,
  releaseDateTimestamp: 1,
  tags: [],
}

describe('chart report public entry points', () => {
  beforeAll(() => {
    initI18n()
  })

  it.each([
    ['canonical song page', <SongSheetContent key="song-page" sheet={sheet} isActive={false} />],
    ['search/list chart dialog', <SheetDialogContent key="sheet-dialog" sheet={sheet} />],
  ])('passes the exact viewed chart to the shared report entry from the %s', (_surface, view) => {
    render(view)

    const entry = screen.getByTestId('chart-report-entry')
    expect(entry.getAttribute('data-song-id')).toBe(sheet.songId)
    expect(entry.getAttribute('data-chart-id')).toBe(sheet.id)
  })
})