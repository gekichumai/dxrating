/** The languages the web app renders (apps/web/project.inlang/settings.json); the OG card labels follow the page's */
export const OG_LOCALES = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'] as const
export type OgLocale = (typeof OG_LOCALES)[number]

export type OgLabels = {
  notes: string
  bpm: string
  version: string
  designer: string
  category: string
}

const OG_LABELS: Record<OgLocale, OgLabels> = {
  en: { notes: 'Notes', bpm: 'BPM', version: 'Version', designer: 'Charter', category: 'Genre' },
  ja: { notes: 'ノーツ数', bpm: 'BPM', version: 'バージョン', designer: '譜面作者', category: 'ジャンル' },
  ko: { notes: '노트 수', bpm: 'BPM', version: '버전', designer: '채보 제작', category: '장르' },
  'zh-Hans': { notes: '物量', bpm: 'BPM', version: '版本', designer: '谱师', category: '分类' },
  'zh-Hant': { notes: '物量', bpm: 'BPM', version: '版本', designer: '譜師', category: '分類' },
}

/** An unknown or missing locale renders the English labels, so every request maps to one of five images */
export function resolveOgLocale(locale: string | null | undefined): OgLocale {
  return (OG_LOCALES as readonly string[]).includes(locale ?? '') ? (locale as OgLocale) : 'en'
}

export function getOgLabels(locale: OgLocale): OgLabels {
  return OG_LABELS[locale]
}