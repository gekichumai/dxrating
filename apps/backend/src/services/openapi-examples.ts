import type { OpenAPI } from '@orpc/openapi'

type OperationExamples = {
  parameters?: Readonly<Record<string, unknown>>
  request?: unknown
  response: unknown
}

const songId = 'dsng_d9dbdcaw9v'
const sheetId = 'dsht_jxnmx39rwt'
const sheetType = 'std'
const sheetDifficulty = 'master'
const connectionId = 'primary-maimai-account'

const tagGroup = {
  id: 1,
  localized_name: { en: 'Patterns', ja: 'パターン', 'zh-Hans': '配置' },
  color: '#7dd3fc',
}

const tag = {
  id: 1,
  localized_name: { en: 'Umiyuri', ja: 'ウミユリ配置', 'zh-Hans': '错位' },
  localized_description: {
    en: 'Complete the intervening notes before returning to the star slide.',
    ja: 'ほかのノーツを処理してからスターのスライドに戻る配置です。',
    'zh-Hans': '先完成其他音符，再回来完成星星条的一种配置。',
  },
  group_id: 1,
}

const tagSong = {
  song_id: songId,
  sheet_id: sheetId,
  sheet_type: sheetType,
  sheet_difficulty: sheetDifficulty,
  tag_id: 1,
}

const arcadeInstallation = {
  id: 'dins_mtd92acetd',
  gameId: 'maimai',
  gameName: 'maimai DX',
  status: 'online',
  region: 'JP',
  network: 'ALL.Net',
  confidence: 0.9,
  observedAt: '2026-07-30T02:38:49.063Z',
}

const arcadeVenue = {
  id: 'dven_ctwf8yjqy6',
  name: 'ＧｉＧＯ　ＢＬｉＸ茅ヶ崎',
  chainId: 'gigo',
  countryCode: 'JP',
  address: '神奈川県茅ヶ崎市新栄町１１ー８',
  timezone: 'Asia/Tokyo',
  latitude: 35.3318835481175,
  longitude: 139.405095190352,
  installations: [arcadeInstallation],
}

const lxnsScore = {
  id: 417,
  songName: 'ウミユリ海底譚',
  level: '13',
  levelIndex: 3,
  achievements: 100.5,
  fc: 'ap',
  fs: 'fsd',
  type: 'standard',
  dxScore: 2277,
}

const lxnsScoresResponse = {
  scores: [
    lxnsScore,
    {
      id: 1469,
      songName: '"411Ψ892"',
      level: '14',
      levelIndex: 3,
      achievements: 99.8475,
      fc: 'fc',
      fs: null,
      type: 'dx',
      dxScore: 2784,
    },
  ],
  count: 2,
}

const achievementRecord = {
  sheet: { songId: 'ウミユリ海底譚', type: 'std', difficulty: 'master' },
  achievement: {
    rate: 100.5,
    dxScore: { achieved: 2277, total: 2277 },
    flags: ['allPerfect+', 'fullSyncDX+'],
  },
}

const lxnsAuthorizationUrl =
  'https://maimai.lxns.net/oauth/authorize?response_type=code&client_id=dxrating&scope=read_user_profile%20read_player&state=550e8400-e29b-41d4-a716-446655440000'

export const publicApiOperationExamples = {
  'tags.list': {
    parameters: { idScheme: 'public' },
    response: { tags: [tag], tagGroups: [tagGroup], tagSongs: [tagSong] },
  },
  'tags.attach': {
    request: { songId, sheetId, sheetType, sheetDifficulty, tagId: 1 },
    response: { id: 1842 },
  },
  'comments.create': {
    request: {
      songId,
      sheetId,
      sheetType,
      sheetDifficulty,
      content: 'The delayed star slide is the key to this chart.',
    },
    response: { id: 1842, created_at: '2026-08-30T15:04:05.000Z' },
  },
  'comments.list': {
    parameters: { songId, sheetId, sheetType, sheetDifficulty },
    response: [
      {
        id: 1842,
        parent_id: null,
        created_at: '2026-08-30T15:04:05.000Z',
        content: 'The delayed star slide is the key to this chart.',
        display_name: 'mai-player',
      },
      {
        id: 1843,
        parent_id: 1842,
        created_at: '2026-08-30T15:08:21.000Z',
        content: 'Slowing the slide down helped me read it consistently.',
        display_name: 'splash-plus',
      },
    ],
  },
  'aliases.list': {
    parameters: { idScheme: 'public' },
    response: [
      { song_id: songId, name: '海底谭你学不会' },
      { song_id: songId, name: '海𠷡' },
    ],
  },
  'aliases.create': {
    request: { songId, name: 'umiyuri' },
    response: { id: 512 },
  },
  'analytics.trending': {
    parameters: { idScheme: 'public' },
    response: {
      results: [{ songId }, { songId: 'dsng_h48zscdxvs' }, { songId: 'dsng_phnye8rsgn' }],
      dateFrom: '2026-08-24',
      dateTo: '2026-08-31',
    },
  },
  'arcades.games': {
    response: {
      items: [
        { id: 'maimai', name: 'maimai DX', manufacturer: 'SEGA' },
        { id: 'chunithm', name: 'CHUNITHM', manufacturer: 'SEGA' },
        { id: 'sdvx', name: 'SOUND VOLTEX', manufacturer: 'KONAMI' },
      ],
    },
  },
  'arcades.venues': {
    parameters: {
      minLatitude: 35.3,
      minLongitude: 139.3,
      maxLatitude: 35.4,
      maxLongitude: 139.5,
      games: 'maimai',
      chains: 'gigo',
      query: 'ＢＬｉＸ茅ヶ崎',
      status: 'online',
    },
    response: {
      items: [arcadeVenue],
      chains: [{ id: 'gigo', name: 'GiGO', countryCodes: ['JP'] }],
    },
  },
  'arcades.venue': {
    parameters: { id: arcadeVenue.id },
    response: arcadeVenue,
  },
  'lxns.authorize': {
    response: { url: lxnsAuthorizationUrl },
  },
  'lxns.status': {
    response: { connected: true },
  },
  'lxns.start': {
    response: lxnsScoresResponse,
  },
  'lxns.disconnect': {
    response: { success: true },
  },
  'lxns.authorizeConnection': {
    request: { connectionId },
    response: { url: lxnsAuthorizationUrl },
  },
  'lxns.connectionStatus': {
    parameters: { connectionId },
    response: { connected: true },
  },
  'lxns.startConnection': {
    request: { connectionId },
    response: lxnsScoresResponse,
  },
  'lxns.disconnectConnection': {
    request: { connectionId },
    response: { success: true },
  },
  'maimai.fetchRecords': {
    request: { id: 'example_sega_id', password: 'not-a-real-password', region: 'jp' },
    response: {
      recentRecords: [
        {
          ...achievementRecord,
          play: { track: 1, timestamp: '2026-08-30T14:52:13.000Z' },
        },
      ],
      musicRecords: [achievementRecord],
    },
  },
} satisfies Record<string, OperationExamples>

const operationsWithDedicatedExamples = new Set(['getPublishedDxdataCatalog', 'headPublishedDxdataCatalog'])
const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

const isReference = (value: object): value is OpenAPI.ReferenceObject => '$ref' in value

const getJsonContent = (content: Record<string, OpenAPI.MediaTypeObject> | undefined) => {
  if (!content) return undefined
  const entry = Object.entries(content).find(([mediaType]) => /^application\/json(?:;|$)/i.test(mediaType))
  return entry?.[1]
}

const addMediaExample = (media: OpenAPI.MediaTypeObject, summary: string, value: unknown) => {
  media.examples = {
    example: { summary, value },
  }
}

export const addPublicApiExamplesToOpenApi = (document: OpenAPI.Document): OpenAPI.Document => {
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || isReference(pathItem)) continue

    for (const method of httpMethods) {
      const operation = pathItem[method]
      if (!operation) continue

      const operationId = operation.operationId
      if (!operationId) throw new Error(`Public OpenAPI operation ${method.toUpperCase()} ${path} has no operationId`)
      if (operationsWithDedicatedExamples.has(operationId)) continue

      const examples: OperationExamples | undefined =
        publicApiOperationExamples[operationId as keyof typeof publicApiOperationExamples]
      if (!examples) throw new Error(`Public OpenAPI operation ${operationId} has no examples`)

      const parameterExamples = examples.parameters ?? {}
      for (const parameterOrReference of operation.parameters ?? []) {
        if (isReference(parameterOrReference)) continue
        if (!(parameterOrReference.name in parameterExamples)) {
          throw new Error(`Public OpenAPI parameter ${operationId}.${parameterOrReference.name} has no example`)
        }

        const value = parameterExamples[parameterOrReference.name]
        parameterOrReference.example = value
        const parameterSchema = parameterOrReference.schema
        if (parameterSchema && !('$ref' in parameterSchema)) {
          parameterSchema.example = value
        }
      }

      if (operation.requestBody && !isReference(operation.requestBody)) {
        const requestMedia = getJsonContent(operation.requestBody.content)
        if (requestMedia) {
          if (!('request' in examples)) throw new Error(`Public OpenAPI request ${operationId} has no example`)
          addMediaExample(requestMedia, `${operation.summary ?? operationId} request`, examples.request)
        }
      }

      let documentedResponse = false
      for (const [status, responseOrReference] of Object.entries(operation.responses)) {
        if (!/^2\d\d$/.test(status) || isReference(responseOrReference)) continue
        const responseMedia = getJsonContent(responseOrReference.content)
        if (!responseMedia) continue
        addMediaExample(responseMedia, `${operation.summary ?? operationId} response`, examples.response)
        documentedResponse = true
      }
      if (!documentedResponse) throw new Error(`Public OpenAPI response ${operationId} has no JSON success response`)
    }
  }

  return document
}