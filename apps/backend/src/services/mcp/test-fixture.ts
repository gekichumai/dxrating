import type { PublishedCatalog, PublishedSheet } from './catalog'

// A small published catalog for the tests of the MCP server, in the shape the producer publishes
// (PublishedDxdataCatalogSchema).

export const UMIYURI = 'dsng_d9dbdcaw9v'
export const UMIYURI_MASTER = 'dsht_jxnmx39rwt'
export const UMIYURI_EXPERT = 'dsht_jxnmx39rwa'
export const UMIYURI_UTAGE = 'dsng_phnye8rsgn'
export const RHYTHM_TEST = 'dsng_e3bzx8srqf'
export const HIBANA = 'dsng_hbn2345678'
export const HIBANA_MASTER = 'dsht_hbn2345678'
export const SYMBOLS = 'dsng_sym2345678'
export const LINK_A = 'dsng_kna2345678'
export const LINK_B = 'dsng_knb2345678'

const sheet = (overrides: Partial<PublishedSheet> & Pick<PublishedSheet, 'id'>): PublishedSheet => ({
  type: 'dx',
  difficulty: 'master',
  level: '13',
  internalLevelValue: 13,
  noteCounts: { tap: 500, hold: 50, slide: 50, touch: 20, break: 30, total: 650 },
  serverIds: ['jp', 'intl', 'usa', 'cn'],
  isSpecial: false,
  version: 'PRiSM',
  ...overrides,
})

const song = {
  category: 'maimai',
  bpm: 150,
  imageName: 'cover',
  version: 'PRiSM',
  isNew: false,
  isLocked: false,
  searchAcronyms: [] as string[],
}

export const publishedCatalog: PublishedCatalog = {
  schemaVersion: 1,
  updatedAt: '2026-10-28T15:00:00.000000000+00:00',
  categories: [{ category: 'maimai' }, { category: 'niconico＆ボーカロイド' }, { category: '宴会場' }],
  versions: [{ version: 'ORANGE PLUS', abbr: 'ORANGE+', releaseDate: '2015-03-19' }],
  types: [
    { type: 'dx', name: 'DX', abbr: 'DX' },
    { type: 'std', name: 'STD', abbr: 'STD' },
    { type: 'utage', name: '宴', abbr: '宴' },
  ],
  difficulties: [{ difficulty: 'master', name: 'MASTER', color: '#9e45e2' }],
  servers: [
    { id: 'jp', name: '日本版' },
    { id: 'intl', name: '海外版 (International ver.)' },
    { id: 'usa', name: 'アメリカ海外版 (USA International ver.)' },
    { id: 'cn', name: '中国版' },
  ],
  songs: [
    {
      ...song,
      id: UMIYURI,
      category: 'niconico＆ボーカロイド',
      title: 'ウミユリ海底譚',
      artist: 'n-buna',
      bpm: 120,
      imageName: 'e05e2a6f',
      version: 'ORANGE PLUS',
      searchAcronyms: ['umiyuri', 'Umiyuri Kaiteitan'],
      sheets: [
        sheet({
          id: UMIYURI_MASTER,
          type: 'std',
          level: '13',
          internalLevelValue: 13.4,
          noteDesigner: 'はっぴー',
          noteCounts: { tap: 648, hold: 21, slide: 76, break: 14, total: 759 },
          serverIds: ['jp', 'intl', 'usa', 'cn'],
          version: 'ORANGE PLUS',
          internalId: 417,
          releaseDate: '2015-05-14',
          multiverInternalLevelValue: { BUDDiES: 13.4, 'maimaiでらっくす PLUS': 12.8 },
        }),
        sheet({
          id: UMIYURI_EXPERT,
          type: 'std',
          difficulty: 'expert',
          level: '11',
          internalLevelValue: 11.2,
          version: 'ORANGE PLUS',
        }),
      ],
    },
    {
      ...song,
      id: UMIYURI_UTAGE,
      category: '宴会場',
      title: '[習]ウミユリ海底譚',
      artist: 'n-buna',
      searchAcronyms: ['[习]ウミユリ海底谭', '我们当年哪有这条件'],
      sheets: [
        sheet({
          id: 'dsht_cjgcb6z68z',
          type: 'utage',
          difficulty: '【習】',
          level: '12+?',
          internalLevelValue: 12.7,
          isSpecial: true,
          comment: 'ウミユリ練習譚',
        }),
      ],
    },
    {
      ...song,
      id: RHYTHM_TEST,
      title: '全世界共通リズム感テスト',
      artist: '☆リズムに合わせてボタンを叩き達成率を競うゲームです☆',
      sheets: [
        sheet({
          id: 'dsht_zqs3r86ssb',
          type: 'std',
          difficulty: 'basic',
          level: '6',
          internalLevelValue: 6,
          serverIds: ['intl', 'usa'],
          serverOverrides: { intl: { version: 'Splash' } },
          version: 'ORANGE PLUS',
        }),
      ],
    },
    {
      ...song,
      id: HIBANA,
      category: 'niconico＆ボーカロイド',
      title: 'ヒバナ',
      artist: 'DECO*27',
      isNew: true,
      sheets: [
        sheet({
          id: HIBANA_MASTER,
          level: '12+',
          internalLevelValue: 12.9,
          serverOverrides: { intl: { level: '13', levelValue: 13.0 } },
        }),
        sheet({ id: 'dsht_hbn2345679', difficulty: 'remaster', level: '13+', internalLevelValue: 13.8 }),
      ],
    },
    {
      ...song,
      id: SYMBOLS,
      title: '+♂',
      artist: 'ビートまりお',
      sheets: [sheet({ id: 'dsht_sym2345678' })],
    },
    { ...song, id: LINK_A, title: 'Link', artist: 'Clean Tears', sheets: [sheet({ id: 'dsht_kna2345678' })] },
    { ...song, id: LINK_B, title: 'Link', artist: 'Ryu☆', sheets: [sheet({ id: 'dsht_knb2345678', type: 'std' })] },
  ],
  tagGroups: [{ id: 1, localized_name: { en: 'Patterns', ja: 'パターン', 'zh-Hans': '配置' }, color: '#7dd3fc' }],
  tags: [
    {
      id: 1,
      localized_name: { en: 'Umiyuri', ja: 'ウミユリ配置', 'zh-Hans': '错位' },
      localized_description: { en: 'Umiyuri patterns' },
      group_id: 1,
    },
  ],
  tagSongs: [{ song_id: UMIYURI, sheet_id: UMIYURI_MASTER, sheet_type: 'std', sheet_difficulty: 'master', tag_id: 1 }],
  aliases: [
    { song_id: UMIYURI, name: '海底谭' },
    { song_id: UMIYURI, name: '海底谭' },
    { song_id: HIBANA, name: '火花' },
    // an alias of another song that is a whole title: the title wins
    { song_id: HIBANA, name: 'Link' },
  ],
}