import { NODE_ELEMENT_NODE } from './client'
import type { Flag, MusicRecord } from './record'

const MUSIC_RECORD_FLAG_MATCHERS: Record<Flag, { flag: Flag; image: string }> = {
  fullCombo: { flag: 'fullCombo', image: 'fc.png' },
  'fullCombo+': { flag: 'fullCombo+', image: 'fcplus.png' },
  allPerfect: { flag: 'allPerfect', image: 'ap.png' },
  'allPerfect+': { flag: 'allPerfect+', image: 'applus.png' },
  syncPlay: { flag: 'syncPlay', image: 'sync.png' },
  fullSync: { flag: 'fullSync', image: 'fs.png' },
  'fullSync+': { flag: 'fullSync+', image: 'fsplus.png' },
  fullSyncDX: { flag: 'fullSyncDX', image: 'fsd.png' },
  'fullSyncDX+': { flag: 'fullSyncDX+', image: 'fsdplus.png' },
}

export function parseMusicRecordNode(record: Element): MusicRecord[] {
  if (record.nodeType !== NODE_ELEMENT_NODE) return [] as const
  const el = record

  const songId = el.querySelector('.music_name_block')?.textContent?.trim()
  const achievementRateString = el.querySelector('.music_score_block.w_112')?.textContent?.trim()

  const achievementRate = Number.parseInt(achievementRateString?.replace('%', '').replace('.', '') ?? '')

  const typeIcon = el.querySelector('.music_kind_icon')?.attributes.getNamedItem('src')
  let type = typeIcon?.value.match(/music_(standard|dx)\.png/)?.[1]

  ;(() => {
    if (el.querySelector('.music_kind_icon_dx')?.attributes.getNamedItem('class')?.value.includes('_btn_on') === true) {
      type = 'dx'
    }
    if (
      el.querySelector('.music_kind_icon_standard')?.attributes.getNamedItem('class')?.value.includes('_btn_on') ===
      true
    ) {
      type = 'standard'
    }
  })()

  const difficultyIcon = el.querySelector('.h_20.f_l')?.attributes.getNamedItem('src')
  const difficulty = difficultyIcon?.value.match(/diff_(.*)\.png/)?.[1]

  // overrides
  if (difficulty === 'utage') {
    type = 'utage'
  }

  const dxScorePair = (el.querySelector('.music_score_block.w_190')?.textContent?.trim() ?? '')
    .split(' / ')
    .flatMap((el) => {
      try {
        return [Number.parseInt(el.replace(',', ''))]
      } catch {
        return [] as const
      }
    })

  if (dxScorePair.length !== 2) {
    // console.warn("[parseNode] invalid dx score pair:", dxScorePair);
    return [] as const
  }

  if (
    songId === undefined ||
    songId === null ||
    songId === '' ||
    type === undefined ||
    type === null ||
    type === '' ||
    difficulty === undefined ||
    difficulty === null ||
    difficulty === ''
  ) {
    // console.warn(
    //   "[parseNode] missing required fields:",
    //   songId,
    //   type,
    //   difficulty
    // );
    return [] as const
  }

  const flags: Flag[] = []

  const flagImages = el.querySelectorAll('form img.f_r')
  for (const flagImage of Array.from(flagImages)) {
    if (flagImage.nodeType !== NODE_ELEMENT_NODE) return [] as const
    const el = flagImage
    const src = el.attributes.getNamedItem('src')?.value
    if (src === undefined || src === null || src === '') {
      console.warn('[parseNode] missing src attribute on flag image', el.innerHTML)
      continue
    }
    const flag = Object.values(MUSIC_RECORD_FLAG_MATCHERS).find(({ image }) => src.includes(image))
    if (flag !== undefined) {
      flags.push(flag.flag)
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
    },
  ] as const
}