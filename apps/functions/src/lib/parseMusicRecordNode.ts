import type { Flag, MusicRecord } from './record'

export const NODE_ELEMENT_NODE = 1
export const NODE_TEXT_NODE = 3

const MUSIC_RECORD_FLAG_MATCHERS: Record<Flag, string> = {
  fullCombo: 'fc.png',
  'fullCombo+': 'fcplus.png',
  allPerfect: 'ap.png',
  'allPerfect+': 'applus.png',
  syncPlay: 'sync.png',
  fullSync: 'fs.png',
  'fullSync+': 'fsplus.png',
  fullSyncDX: 'fsd.png',
  'fullSyncDX+': 'fsdplus.png',
}

export function parseMusicRecordNode(record: Element): MusicRecord[] {
  if (record.nodeType !== NODE_ELEMENT_NODE) return [] as const
  const el = record

  const songId = el.querySelector('.music_name_block')?.textContent?.trim()
  const achievementRateString = el.querySelector('.music_score_block.w_112')?.textContent?.trim()

  const achievementRate = Number.parseInt(achievementRateString?.replace('%', '').replace('.', '') ?? '')

  const typeIcon = el.querySelector('.music_kind_icon')?.getAttribute('src')
  let type = typeIcon?.match(/music_(standard|dx)\.png/)?.[1]
  ;(() => {
    if (el.querySelector('.music_kind_icon_dx')?.getAttribute('class')?.includes('_btn_on')) {
      type = 'dx'
    }
    if (el.querySelector('.music_kind_icon_standard')?.getAttribute('class')?.includes('_btn_on')) {
      type = 'standard'
    }
  })()

  const difficultyIcon = el.querySelector('.h_20.f_l')?.getAttribute('src')
  const difficulty = difficultyIcon?.match(/diff_(.*)\.png/)?.[1]

  // overrides
  if (difficulty === 'utage') {
    type = 'utage'
  }

  const dxScorePair = (el.querySelector('.music_score_block.w_190')?.textContent?.trim() ?? '')
    .split(' / ')
    .flatMap((scoreEl) => {
      try {
        return [Number.parseInt(scoreEl.replace(',', ''))]
      } catch (_e) {
        return [] as const
      }
    }) as [number, number]

  if (dxScorePair.length !== 2) {
    return [] as const
  }

  if (!songId || !type || !difficulty) {
    return [] as const
  }

  const flags: Flag[] = []

  const flagImages = el.querySelectorAll('form img.f_r')
  for (const flagImage of Array.from(flagImages)) {
    if (flagImage.nodeType !== NODE_ELEMENT_NODE) return [] as const
    const imgEl = flagImage as Element
    const src = imgEl.getAttribute('src')
    if (!src) {
      console.warn('[parseNode] missing src attribute on flag image')
      continue
    }
    const flag = (Object.keys(MUSIC_RECORD_FLAG_MATCHERS) as Flag[]).find((key) =>
      src.includes(MUSIC_RECORD_FLAG_MATCHERS[key]),
    ) as Flag | undefined
    if (flag) {
      flags.push(flag)
    }
  }

  return [
    {
      sheet: {
        songId,
        type,
        difficulty,
      },
      achievement: {
        rate: achievementRate,
        dxScore: {
          achieved: dxScorePair[0],
          total: dxScorePair[1],
        },
        flags,
      },
    } as MusicRecord,
  ] as const
}
