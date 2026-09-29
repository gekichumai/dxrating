import type { Flag, RecentRecord } from './record'
import { NODE_ELEMENT_NODE, NODE_TEXT_NODE } from './client'

const RECENT_RECORD_FLAG_MATCHERS: Record<Flag, { flag: Flag; image: string }> = {
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

export function parseRecentRecordNode(record: Element): RecentRecord[] {
  if (record.nodeType !== NODE_ELEMENT_NODE) return [] as const
  const el = record

  // Extract only the direct text content of the element, excluding child elements like the level icon
  const songIdElement = el.querySelector('.basic_block.break')
  const songId =
    songIdElement !== undefined && songIdElement !== null
      ? Array.from(songIdElement.childNodes)
          .filter((node) => node.nodeType === NODE_TEXT_NODE)
          .map((node) => node.textContent?.trim())
          .join('')
          .trim()
      : undefined

  const achievementRateString = el.querySelector('.playlog_achievement_txt')?.textContent?.trim()

  const achievementRate = Number.parseInt(achievementRateString?.replace('%', '').replace('.', '') ?? '')

  const typeIcon = el.querySelector('.playlog_music_kind_icon')?.attributes.getNamedItem('src')
  let type = typeIcon?.value.match(/music_(standard|dx)\.png/)?.[1]

  const difficultyIcon = el.querySelector('.playlog_diff')?.attributes.getNamedItem('src')
  const difficulty = difficultyIcon?.value.match(/diff_(.*)\.png/)?.[1]

  // overrides
  if (difficulty === 'utage') {
    type = 'utage'
  }

  const dxScorePair = (el.querySelector('.playlog_score_block')?.textContent?.trim() ?? '')
    .split(' / ')
    .flatMap((el) => {
      try {
        return [Number.parseInt(el.replace(',', ''))]
      } catch {
        return [] as const
      }
    })

  if (dxScorePair.length !== 2) {
    console.warn('[parseNode] invalid dx score pair:', dxScorePair)
    return [] as const
  }

  const subtitles = el.querySelectorAll('.sub_title .v_b')
  const trackString = subtitles[0].textContent ?? ''
  const track = Number.parseInt(trackString.replace('TRACK', '').trim(), 10)

  const playedAtString = subtitles[1].textContent?.trim()
  const playedAt = playedAtString?.replace(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:00+09:00')

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
    console.warn('[parseNode] missing required fields:', songId, type, difficulty)
    return [] as const
  }

  const flags: Flag[] = []

  const flagImages = el.querySelectorAll('.playlog_result_innerblock img.f_l')
  for (const flagImage of Array.from(flagImages)) {
    if (flagImage.nodeType !== NODE_ELEMENT_NODE) return [] as const
    const el = flagImage
    const src = el.attributes.getNamedItem('src')?.value
    if (src === undefined || src === null || src === '') {
      console.warn('[parseNode] missing src attribute on flag image', el.innerHTML)
      continue
    }
    const flag = Object.values(RECENT_RECORD_FLAG_MATCHERS).find(({ image }) => src.includes(image))
    if (flag !== undefined) {
      flags.push(flag.flag)
    }
  }

  return [
    {
      play: {
        track,
        timestamp: playedAt,
      },
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
  ]
}