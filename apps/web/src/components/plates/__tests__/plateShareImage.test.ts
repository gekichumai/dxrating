import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import type { PlateRecord } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { evaluatePlatePage, type PlatePageChart } from '../plateData'
import {
  countMissingByDifficulty,
  describeSheetState,
  formatAchievement,
  plateShareLink,
  rankRemainingSongs,
} from '../plateShareImage'

const chart = (songId: string, levelValue: number): PlatePageChart => ({
  songId,
  title: songId,
  artist: '',
  imageName: songId,
  type: TypeEnum.DX,
  version: VersionEnum.PRiSM,
  level: String(levelValue),
  levelValue,
  remasterDiffersByServer: false,
  sheets: [DifficultyEnum.Expert, DifficultyEnum.Master].map((difficulty) => ({
    id: `${songId}-${difficulty}`,
    difficulty,
    level: String(levelValue),
    internalLevelValue: levelValue,
  })),
})

const record = (achievementRate: number, extra: Partial<PlateRecord> = {}): PlateRecord => ({
  achievementRate,
  comboFlag: null,
  syncFlag: null,
  ...extra,
})

describe('rankRemainingSongs', () => {
  const charts = [chart('untouched', 14), chart('close', 13), chart('one-far', 12), chart('done', 11)]
  const records = new Map<string, PlateRecord>([
    ['close-expert', record(100.2)],
    ['close-master', record(99.95)],
    ['one-far-expert', record(100.5)],
    ['one-far-master', record(97)],
    ['done-expert', record(100)],
    ['done-master', record(100.1)],
  ])
  const progress = evaluatePlatePage({ charts, kind: 'sho' }, records)

  it('lists the songs still to do, fewest missing and smallest gap first', () => {
    const ranked = rankRemainingSongs(progress, 'sho', records)
    expect(ranked.map((entry) => entry.status.chart.songId)).toEqual(['close', 'one-far', 'untouched'])
    expect(ranked[0]?.missing).toEqual([
      { id: 'close-master', difficulty: DifficultyEnum.Master, level: '13', state: '99.95%' },
    ])
    expect(ranked[2]?.missing.map((sheet) => sheet.state)).toEqual([null, null])
  })

  it('counts the missing sheets per difficulty', () => {
    expect(countMissingByDifficulty(rankRemainingSongs(progress, 'sho', records))).toEqual([
      { difficulty: DifficultyEnum.Expert, count: 1 },
      { difficulty: DifficultyEnum.Master, count: 3 },
    ])
  })
})

describe('describeSheetState', () => {
  it('reports the lamp the requirement is about, else the score', () => {
    expect(describeSheetState('shin', record(100.8, { comboFlag: 'fcp' }))).toBe('FC+')
    expect(describeSheetState('maimai', record(100.8, { syncFlag: 'fsp' }))).toBe('FS+')
    expect(describeSheetState('kiwami', record(98.5))).toBe('98.50%')
    expect(describeSheetState('sho', undefined)).toBeNull()
  })
  it('rounds achievement down', () => {
    expect(formatAchievement(99.9999)).toBe('99.99%')
  })
})

describe('plateShareLink', () => {
  it('names the exported region in the QR URL, Japan included, and prints the bare path', () => {
    expect(plateShareLink('kuma-sho', 'jp')).toEqual({
      url: 'https://dxrating.net/plates/kuma-sho?region=jp',
      display: 'dxrating.net/plates/kuma-sho',
    })
    expect(plateShareLink('kagami-shin', 'intl').url).toBe('https://dxrating.net/plates/kagami-shin?region=intl')
    expect(plateShareLink('kagami-shin', 'cn').url).toBe('https://dxrating.net/plates/kagami-shin?region=cn')
  })
})