import { VersionEnum } from '@gekichumai/dxdata'
import useSWR from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSheets } from '../songs'

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => VersionEnum.CiRCLEPLUS,
}))

vi.mock('@/models/useCombinedTags', () => ({
  useCombinedTags: () => ({
    data: undefined,
    isLoading: true,
  }),
}))

vi.mock('@/models/useServerAliases', () => ({
  useServerAliases: () => ({
    data: undefined,
    isLoading: true,
  }),
}))

describe('useSheets', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockClear()
    vi.mocked(useSWR).mockReturnValue({ data: [], isLoading: false } as never)
  })

  it('keeps previous partial sheet data while tag and alias data revalidate', () => {
    useSheets({ acceptsPartialData: true })

    expect(useSWR).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({
        keepPreviousData: true,
      }),
    )
  })

  it('does not report loading while previous partial sheet data is visible', () => {
    vi.mocked(useSWR).mockReturnValueOnce({ data: [{ id: 'cached' }], isLoading: true } as never)

    const result = useSheets({ acceptsPartialData: true })

    expect(result.isLoading).toBe(false)
  })
})