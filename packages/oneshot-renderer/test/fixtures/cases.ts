import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import type { RenderInput } from '../../src/types.js'

export const cases = (full: RenderInput) => {
  const typography = structuredClone(full)
  const titles = [
    'AVATAR To Wa fi ffi',
    '日本語の長い曲名と省略記号の確認テスト',
    'Λzure Vixen / café',
    '中文繁體 简体中文 한글',
    'Very long English title that must be clipped with an ellipsis',
  ]
  const difficulties = Object.values(DifficultyEnum)
  const accuracy = ['fc', 'fcp', 'ap', 'app', undefined] as const
  const sync = ['sp', 'fs', 'fsp', 'fsd', 'fsdp', undefined] as const
  typography.data.b35 = typography.data.b35.slice(0, 15).map((entry, i) => ({
    ...entry,
    sheet: {
      ...entry.sheet,
      title: titles[i % titles.length],
      difficulty: difficulties[i % difficulties.length],
      type: i % 2 ? TypeEnum.STD : TypeEnum.DX,
      internalLevelValue: 1 + i,
    },
    achievementRate: i % 3 ? 100.5 : 0,
    achievementAccuracy: accuracy[i % accuracy.length],
    achievementSync: sync[i % sync.length],
    playCount: i % 3 ? 9999 : 0,
    allPerfectPlusCount: i % 2 ? 42 : 0,
    dxScore: { achieved: i * 200, total: 3000, stars: i % 6 },
  }))
  typography.data.b15 = []
  typography.playerCollection = { name: 'DX ＡＶ あいうえお', icon: 1 }

  return [
    { name: 'full-1500', input: full, width: 1500 },
    { name: 'full-750', input: full, width: 750 },
    { name: 'full-3000', input: full, width: 3000 },
    { name: 'typography', input: typography, width: 1500 },
    ...[
      VersionEnum.FESTiVALPLUS,
      VersionEnum.BUDDiES,
      VersionEnum.BUDDiESPLUS,
      VersionEnum.PRiSM,
      VersionEnum.CiRCLE,
      VersionEnum.CiRCLEPLUS,
    ].map((version, i) => ({
      name: `theme-${i}`,
      input: {
        ...full,
        version,
        region: (['jp', 'intl', 'cn', '_generic'] as const)[i % 4],
        playerCollection: i % 2 ? { name: '', icon: 1 } : undefined,
        data: { b35: i % 2 ? full.data.b35.slice(0, 1) : [], b15: [] },
      },
      width: 750,
    })),
  ]
}