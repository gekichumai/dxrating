import { NODE_ELEMENT_NODE, NODE_TEXT_NODE } from './parseMusicRecordNode'
import type { Flag, RecentRecord } from './record'

const RECENT_RECORD_FLAG_MATCHERS: Record<Flag, string> = {
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

export function parseRecentRecordNode(record: Element): RecentRecord[] {
  if (record.nodeType !== NODE_ELEMENT_NODE) return [] as const
  const el = record

  // Extract only the direct text content of the element, excluding child elements like the level icon
  const songIdElement = el.querySelector('.basic_block.break')
  const songId = songIdElement
    ? Array.from(songIdElement.childNodes)
        .filter((node) => node.nodeType === NODE_TEXT_NODE)
        .map((node) => node.textContent?.trim())
        .join('')
        .trim()
    : undefined

  const achievementRateString = el.querySelector('.playlog_achievement_txt')?.textContent?.trim()

  const achievementRate = Number.parseInt(achievementRateString?.replace('%', '').replace('.', '') ?? '')

  const typeIcon = el.querySelector('.playlog_music_kind_icon')?.getAttribute('src')
  let type = typeIcon?.match(/music_(standard|dx)\.png/)?.[1]

  const difficultyIcon = el.querySelector('.playlog_diff')?.getAttribute('src')
  const difficulty = difficultyIcon?.match(/diff_(.*)\.png/)?.[1]

  // overrides
  if (difficulty === 'utage') {
    type = 'utage'
  }

  const dxScorePair = (el.querySelector('.playlog_score_block')?.textContent?.trim() ?? '')
    .split(' / ')
    .flatMap((scoreEl) => {
      try {
        return [Number.parseInt(scoreEl.replace(',', ''))]
      } catch (_e) {
        return [] as const
      }
    }) as [number, number]

  if (dxScorePair.length !== 2) {
    console.warn('[parseNode] invalid dx score pair:', dxScorePair)
    return [] as const
  }

  const subtitles = el.querySelectorAll('.sub_title .v_b')
  const trackString = subtitles[0]?.textContent ?? ''
  const track = Number.parseInt(trackString.replace('TRACK', '').trim(), 10)

  const playedAtString = subtitles[1]?.textContent?.trim()
  const playedAt = playedAtString?.replace(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:00+09:00')

  if (!songId || !type || !difficulty) {
    console.warn('[parseNode] missing required fields:', songId, type, difficulty)
    return [] as const
  }

  const flags: Flag[] = []

  const flagImages = el.querySelectorAll('.playlog_result_innerblock img.f_l')
  for (const flagImage of Array.from(flagImages)) {
    if (flagImage.nodeType !== NODE_ELEMENT_NODE) return [] as const
    const imgEl = flagImage as Element
    const src = imgEl.getAttribute('src')
    if (!src) {
      console.warn('[parseNode] missing src attribute on flag image')
      continue
    }
    const flag = (Object.keys(RECENT_RECORD_FLAG_MATCHERS) as Flag[]).find((key) =>
      src.includes(RECENT_RECORD_FLAG_MATCHERS[key]),
    ) as Flag | undefined
    if (flag) {
      flags.push(flag)
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
