import type { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'

export type Region = 'jp' | 'intl' | 'cn' | '_generic'
export type PlayerCollection = { name: string; icon: number }

/** Only presentation data crosses the renderer boundary; rating calculations stay in the domain package. */
export interface RenderEntry {
  sheet: {
    id: string
    title: string
    imageName: string
    type: TypeEnum.STD | TypeEnum.DX
    difficulty: DifficultyEnum
    internalLevelValue: number
  }
  rating: { ratingAwardValue: number; rank: string | null }
  achievementRate: number
  achievementAccuracy?: 'fc' | 'fcp' | 'ap' | 'app'
  achievementSync?: 'sp' | 'fs' | 'fsp' | 'fsd' | 'fsdp'
  playCount: number
  allPerfectPlusCount: number
  dxScore?: { achieved: number; total: number; stars: number }
}

export interface RenderInput {
  data: { b15: RenderEntry[]; b35: RenderEntry[] }
  version: VersionEnum
  region?: Region
  playerCollection?: PlayerCollection
}

export type LoadAsset = (relativePath: string) => Promise<Buffer>
export type RenderFormat = 'svg' | 'png' | 'jpeg'
export type RenderOptions = { format?: RenderFormat; width?: number }
export type RenderStage = 'calc' | 'font' | 'jsx' | 'satori' | 'resvg' | 'result_buffer'

export interface RenderResult {
  body: string | Uint8Array<ArrayBuffer>
  contentType: 'image/svg+xml' | 'image/png' | 'image/jpeg'
  timings: Partial<Record<RenderStage, number>>
}