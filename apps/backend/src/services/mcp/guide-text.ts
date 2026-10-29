// The texts of the setup guide (guide.ts), one table per language, in the languages of the web app. A text is a line
// of light Markdown (**bold**, `code`, [links](url), bare URLs) with placeholders in braces that guide.ts fills in:
// {url} the endpoint, {guide} this page, {md} its Markdown, {llms} llms.txt, {card} the server card, {site} the
// website, {repo} the repository, {limit} the rate limit, {tools} and {toolcount} the tools, {<app>.link} the
// one-click link of an app, and {<snippet>} a snippet of guide.ts, inline. A block { code } shows a snippet whole.

export type Block = { p: string } | { steps: string[] } | { items: string[] } | { code: string }

export const CHAT_APPS = ['claude', 'chatgpt', 'cherry-studio'] as const
export const CODING_TOOLS = ['claude-code', 'cursor', 'vscode', 'codex', 'gemini-cli'] as const
export type AppId = (typeof CHAT_APPS)[number] | (typeof CODING_TOOLS)[number]

export interface Section {
  id: string
  heading: string
  blocks: Block[]
}

export interface GuideText {
  lang: 'en' | 'ja' | 'zh-Hans' | 'zh-Hant'
  /** The name of the language, in the language switch */
  name: string
  title: string
  /** The description of the page, for search results and link previews */
  description: string
  lead: string[]
  badges: string
  agentHeading: string
  agentIntro: string
  agentPrompt: string
  installHeading: string
  urlLabel: string
  /** The rows under the URL: transport, authentication, name */
  facts: [string, string][]
  urlNote: string
  oneClick: string
  /** The label of a one-click link, %s the app */
  addTo: string
  oneClickNote: string
  chatApps: string
  codingTools: string
  apps: Record<AppId, Block[]>
  /** Before the link to the documentation of an app */
  docs: string
  other: Section
  tryIt: Section
  toolsHeading: string
  toolsIntro: string
  toolHead: [string, string]
  tools: Record<string, string>
  data: Section
  limits: Section
  privacy: Section
  troubleshooting: Section
  links: Section
  footer: string
  /** The language links at the end of the Markdown */
  otherLanguages: string
  /** The labels of the controls of the HTML page, which the Markdown does not have */
  ui: GuideUi
}

export interface GuideUi {
  /** The language in the language switch on phones, abbreviated */
  abbr: string
  /** The name of the link of the logo, to the website */
  home: string
  skip: string
  pageNav: string
  langNav: string
  appNav: string
  markdown: string
  copy: string
  copied: string
  copyPrompt: string
}

/** The names of the apps, the same in every language */
export const APP_NAMES: Record<AppId, string> = {
  claude: 'Claude (claude.ai, Claude Desktop, Claude mobile)',
  chatgpt: 'ChatGPT (web)',
  'cherry-studio': 'Cherry Studio',
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  vscode: 'VS Code (GitHub Copilot)',
  codex: 'Codex (CLI, IDE extension, ChatGPT desktop app)',
  'gemini-cli': 'Gemini CLI',
}

/** The documentation of each app on MCP servers */
export const APP_DOCS: Record<AppId, string> = {
  claude: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
  chatgpt: 'https://developers.openai.com/api/docs/guides/custom-mcp-server',
  'cherry-studio': 'https://docs.cherryai.com.cn/advanced-basic/extensions/mcp',
  'claude-code': 'https://code.claude.com/docs/en/mcp',
  cursor: 'https://cursor.com/docs/mcp',
  vscode: 'https://code.visualstudio.com/docs/agent-customization/mcp-servers',
  codex: 'https://learn.chatgpt.com/docs/extend/mcp',
  'gemini-cli': 'https://geminicli.com/docs/tools/mcp-server/',
}

const en: GuideText = {
  lang: 'en',
  name: 'English',
  title: 'DXRating MCP Server',
  description:
    'maimai DX songs, internal levels and rating calculators for your AI assistant: a free, read-only MCP server ' +
    'without account or API key. How to add it to Claude, ChatGPT, Cursor, VS Code, Cherry Studio and other apps.',
  lead: [
    'maimai DX for your AI assistant. Connect this server and Claude, ChatGPT, Cursor, VS Code, Cherry Studio and ' +
      'other AI apps can look up songs and charts from DXRating (dxrating.net) by any name or alias, read their ' +
      'internal levels (譜面定数) on the JP, international, USA and CN servers, and work out ratings and Best 50.',
    'MCP (Model Context Protocol) is the standard way AI apps connect to outside tools.',
  ],
  badges: 'Free · No account · No API key · Read-only',
  agentHeading: 'Let your agent set it up',
  agentIntro: 'Paste this into Claude Code, Codex, Cursor or another coding agent:',
  agentPrompt:
    'Add the DXRating MCP server to this agent: URL {url}, transport Streamable HTTP, no authentication. Follow the ' +
    'steps for this client in {llms}, add it at user (global) scope, then list its tools to confirm it works.',
  installHeading: 'Install',
  urlLabel: 'Server URL',
  facts: [
    ['Transport', 'Streamable HTTP (not SSE)'],
    ['Authentication', 'None. If your app asks, choose "No authentication" or "No sign in".'],
    ['Suggested name', '`dxrating`'],
  ],
  urlNote: 'Use the URL exactly as shown, ending in `/mcp`. This page ({guide}) is the guide, not the server.',
  oneClick: 'One click:',
  addTo: 'Add to %s',
  oneClickNote: 'These open your app with the server filled in. You still review and confirm.',
  chatApps: 'Chat apps',
  codingTools: 'Coding tools',
  apps: {
    claude: [
      {
        steps: [
          'Open [Add to Claude]({claude.link}), or go to **Customize → Connectors → + Add → Add custom connector**.',
          'Name: `DXRating`. Remote MCP server URL: `{url}`. Click **Continue**.',
          'Under **Authentication** choose **No sign in**, then **Add**.',
          'In a chat, click **+ → Connectors** and turn on DXRating.',
        ],
      },
      {
        p:
          'The Free plan allows one custom connector. On Team and Enterprise plans an owner adds it under ' +
          "**Organization settings → Connectors**, then members click **Connect**. The mobile apps can't add " +
          'connectors; add it on the web or desktop and it syncs.',
      },
    ],
    chatgpt: [
      {
        steps: [
          'Go to https://chatgpt.com/plugins, click **+**, then **Add custom MCP server**.',
          'Name `DXRating`, Server URL `{url}`.',
          'Authentication: **No authentication**. Read the warning, click **I understand and want to continue**, then ' +
            '**Create as a plugin**.',
          'Install the plugin. In a chat, type **@** and choose DXRating.',
        ],
      },
      { p: 'Availability depends on your plan and workspace settings.' },
    ],
    'cherry-studio': [
      {
        p:
          'One click: [Add to Cherry Studio]({cherry-studio.link}). The server arrives switched off: review it, then ' +
          'turn it on. By hand: **Settings → MCP → MCP Servers → Add → Import from JSON**, and paste:',
      },
      { code: 'streamable.json' },
      {
        p:
          'Keep `"type": "streamableHttp"`. Without it Cherry Studio uses the old SSE transport, and the connection ' +
          'fails.',
      },
    ],
    'claude-code': [
      { code: 'claude-code.sh' },
      { p: 'Check with `claude mcp list` or `/mcp`. In a project `.mcp.json`, keep `"type": "http"`:' },
      { code: 'claude-code.json' },
    ],
    cursor: [
      { p: '[Add to Cursor]({cursor.link}), or add this to `~/.cursor/mcp.json`:' },
      { code: 'mcpservers.json' },
    ],
    vscode: [
      { p: '[Add to VS Code]({vscode.link}), or run:' },
      { code: 'vscode.sh' },
      { p: '`.vscode/mcp.json` and the user-profile `mcp.json` use `servers`, not `mcpServers`:' },
      { code: 'vscode.json' },
    ],
    codex: [
      { code: 'codex.sh' },
      { p: 'Or add to `~/.codex/config.toml`, which the IDE extension and the ChatGPT desktop app share:' },
      { code: 'codex.toml' },
    ],
    'gemini-cli': [
      { code: 'gemini.sh' },
      { p: 'Or in `~/.gemini/settings.json` use `httpUrl` (in Gemini, `url` means the old SSE transport):' },
      { code: 'gemini.json' },
    ],
  },
  docs: 'Docs: ',
  other: {
    id: 'other',
    heading: 'Other apps',
    blocks: [
      {
        p:
          'Add a remote MCP server with the URL, Streamable HTTP and no authentication. Most apps (Trae, Kiro, LM ' +
          'Studio, Windsurf, the JetBrains AI Assistant) take this JSON:',
      },
      { code: 'mcpservers.json' },
      { p: 'Apps that only run local (stdio) servers can reach it through `mcp-remote` (needs Node.js):' },
      { code: 'mcp-remote.json' },
    ],
  },
  tryIt: {
    id: 'try',
    heading: 'Try it',
    blocks: [
      { p: 'Ask in any language: English, 日本語, 简体中文, 繁體中文. Titles, aliases and nicknames all work.' },
      {
        items: [
          'Which song is "bbb"? List its charts with their levels.',
          "What is the internal level of PANDORA PARADOXXX's Re:MASTER on the JP, international and CN servers?",
          'Which charts of level 14 have the lowest internal level on the international server?',
          'What rating does 100.5% on the master chart of 系ぎて give, and what do I need for 300?',
          'Here are my best scores: … What is my Best 50 rating, and which charts should I improve first?',
          "Has the internal level of PANDORA PARADOXXX's master chart changed between versions?",
        ],
      },
      {
        p:
          '**Check that it works:** ask "Using DXRating, what is the internal level of the master chart of 系ぎて?" ' +
          'A good answer names the server and the version, and credits DXRating. If the assistant answers without ' +
          'calling a tool, say "use the DXRating tools".',
      },
    ],
  },
  toolsHeading: 'Tools',
  toolsIntro: 'All tools are read-only. They read the public song catalog and cannot see or change any account.',
  toolHead: ['Tool', 'What it does'],
  tools: {
    search_songs: 'Finds songs by title, alias, nickname, romanization or artist, with the level of each chart',
    get_sheet: 'A song and its charts: internal level now and in past versions, notes, designer, servers, tags',
    calculate_rating:
      'The rating of an achievement on a chart, the achievement a rating needs, the rating of each rank',
    calculate_best50: 'A rating from pasted scores: the new 15 and old 35, and the scores worth improving',
  },
  data: {
    id: 'data',
    heading: 'Data and license',
    blocks: [
      {
        items: [
          'The songs, charts, aliases and tags are those of DXRating (dxrating.net), updated with each game update. ' +
            'Internal levels can differ by server: jp (Japan), intl (international), usa and cn. The assistant asks ' +
            'yours or uses jp.',
          'Achievements are integers in 1/10000 of a percent, in what the tools take and return: 100.7543% is ' +
            '`1007543`. Your assistant converts them for you.',
          'Ratings follow the game: Best 50 is the 15 best charts of the current version plus the 35 best of older ' +
            "ones. AP and AP+ add 1 to a chart's rating.",
          'License: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), for non-commercial use with ' +
            'credit: `Data: DXRating (https://dxrating.net), CC BY-NC 4.0`. The server asks assistants to include it.',
        ],
      },
    ],
  },
  limits: {
    id: 'limits',
    heading: 'Limits',
    blocks: [
      {
        items: [
          '{limit} requests per minute per IP address. A question usually takes 1 to 4 requests.',
          'Over the limit, the server answers "Too many requests. Retry in N seconds." Wait that long and retry.',
          "Claude.ai and ChatGPT connect from their companies' servers, so their users may share a limit.",
          'Best 50 takes up to 300 scores per request.',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    heading: 'Privacy',
    blocks: [
      {
        items: [
          'No account, no key, no cookies. This page loads no third-party scripts and has no analytics.',
          'The server only receives what your assistant sends it: the tool name and its arguments, such as a song ' +
            'name or the scores you pasted. It never sees your conversation, and it does not store your scores.',
          'For each request we log the time, the path, the status, how long it took and the request headers, which ' +
            'include the IP address and the User-Agent, but not the body with the tool arguments. The logs go to our ' +
            'monitoring provider (Sentry) and are used only to run the service and stop abuse.',
          'Requests pass through Cloudflare, which processes them under its own terms.',
        ],
      },
    ],
  },
  troubleshooting: {
    id: 'troubleshooting',
    heading: 'Troubleshooting',
    blocks: [
      {
        items: [
          '**"Can\'t connect", an SSE error, or 405:** the app may be using the old SSE transport, which this server ' +
            'does not support. Choose Streamable HTTP: `"type": "streamableHttp"` in Cherry Studio, `httpUrl` in ' +
            'Gemini CLI.',
          '**The app asks you to sign in:** no sign-in is needed. Choose "No sign in" or "No authentication".',
          "**Opening `/mcp` in a browser brings you here:** that's expected. The endpoint only takes POST requests " +
            'from AI apps.',
          '**"still loading its song catalog":** the server restarted. Retry in a minute.',
          '**The tools are added but not used:** turn the connector on in the chat and say "use DXRating".',
        ],
      },
      {
        p: '**Test without an AI:** run `npx @modelcontextprotocol/inspector`, choose Streamable HTTP and enter the URL. Or:',
      },
      { code: 'curl.sh' },
    ],
  },
  links: {
    id: 'links',
    heading: 'Links',
    blocks: [
      {
        items: [
          'Website: {site}',
          'This guide as Markdown: {md} · for agents: {llms}',
          'Server card: {card}',
          'Source code: {repo} (apps/backend/src/services/mcp)',
          'Report a problem: {repo}/issues',
        ],
      },
    ],
  },
  footer:
    "Steps checked against each app's documentation in October 2026. Apps change their menus often; if a step is out " +
    'of date, please [open an issue]({repo}/issues).',
  otherLanguages: 'Other languages',
  ui: {
    abbr: 'EN',
    home: 'DXRating home',
    skip: 'Skip to content',
    pageNav: 'On this page',
    langNav: 'Language',
    appNav: 'Apps',
    markdown: 'Markdown',
    copy: 'Copy',
    copied: 'Copied',
    copyPrompt: 'Copy prompt for your agent',
  },
}

const ja: GuideText = {
  lang: 'ja',
  name: '日本語',
  title: 'DXRating MCP サーバー',
  description:
    'maimai DX の楽曲・譜面定数・レーティング計算を AI アシスタントに。アカウントも API キーも不要な、無料の読み取り専用 MCP ' +
    'サーバーです。Claude、ChatGPT、Cursor、VS Code、Cherry Studio などへの追加方法。',
  lead: [
    'maimai DX を AI アシスタントに。このサーバーを接続すると、Claude、ChatGPT、Cursor、VS Code、Cherry Studio などの AI ' +
      'アプリが DXRating（dxrating.net）の楽曲と譜面を曲名・別名で探し、日本・インターナショナル・USA・中国版の譜面定数を調べ、' +
      'レーティングやベスト枠（Best 50）を計算できます。',
    'MCP（Model Context Protocol）は、AI アプリが外部のツールにつながるための標準の仕組みです。',
  ],
  badges: '無料 · アカウント不要 · API キー不要 · 読み取り専用',
  agentHeading: 'エージェントに設定してもらう',
  agentIntro: 'Claude Code、Codex、Cursor などのコーディングエージェントに貼り付けてください：',
  agentPrompt:
    'Add the DXRating MCP server to this agent: URL {url}, transport Streamable HTTP, no authentication. Follow the ' +
    'steps for this client in {llms}, add it at user (global) scope, then list its tools to confirm it works.',
  installHeading: '追加する',
  urlLabel: 'サーバー URL',
  facts: [
    ['トランスポート', 'Streamable HTTP（SSE ではありません）'],
    ['認証', 'なし。アプリに聞かれたら「認証なし」「No authentication」を選んでください。'],
    ['名前の例', '`dxrating`'],
  ],
  urlNote: 'URL は `/mcp` まで、表示どおりに入れてください。このページ（{guide}）は案内で、サーバーではありません。',
  oneClick: 'ワンクリック：',
  addTo: '%s に追加',
  oneClickNote: 'アプリがサーバーを入力した状態で開きます。内容を確認してから追加してください。',
  chatApps: 'チャットアプリ',
  codingTools: 'コーディングツール',
  apps: {
    claude: [
      {
        steps: [
          '[Claude に追加]({claude.link})を開くか、**カスタマイズ → コネクタ → + 追加 → カスタムコネクタを追加** を開きます。',
          '名前：`DXRating`。リモート MCP サーバーの URL：`{url}`。**続行** を押します。',
          '**認証** で **サインインなし** を選び、**追加** を押します。',
          'チャットで **+ → コネクタ** を開き、DXRating をオンにします。',
        ],
      },
      {
        p:
          '無料プランで追加できるカスタムコネクタは 1 つです。Team・Enterprise プランではオーナーが **組織の設定 → コネクタ** ' +
          'で追加し、メンバーが **接続** を押します。モバイルアプリでは追加できないので、Web かデスクトップで追加すると同期されます。',
      },
    ],
    chatgpt: [
      {
        steps: [
          'https://chatgpt.com/plugins を開き、**+** → **Add custom MCP server** を押します。',
          '名前は `DXRating`、Server URL は `{url}`。',
          '認証は **No authentication**。注意書きを読んで **I understand and want to continue**、**Create as a plugin** を押します。',
          'プラグインをインストールし、チャットで **@** を入力して DXRating を選びます。',
        ],
      },
      { p: '使えるかどうかはプランとワークスペースの設定によります。' },
    ],
    'cherry-studio': [
      {
        p:
          'ワンクリック：[Cherry Studio に追加]({cherry-studio.link})。サーバーはオフの状態で追加されるので、確認してからオンに' +
          'してください。手動の場合：**設定 → MCP → MCP サーバー → 追加 → JSON からインポート** に貼り付けます：',
      },
      { code: 'streamable.json' },
      { p: '`"type": "streamableHttp"` は消さないでください。ないと古い SSE で接続しようとして失敗します。' },
    ],
    'claude-code': [
      { code: 'claude-code.sh' },
      {
        p: '`claude mcp list` か `/mcp` で確認できます。プロジェクトの `.mcp.json` では `"type": "http"` を付けます：',
      },
      { code: 'claude-code.json' },
    ],
    cursor: [
      { p: '[Cursor に追加]({cursor.link})、または `~/.cursor/mcp.json` に追加します：' },
      { code: 'mcpservers.json' },
    ],
    vscode: [
      { p: '[VS Code に追加]({vscode.link})、または次を実行します：' },
      { code: 'vscode.sh' },
      { p: '`.vscode/mcp.json` とユーザープロファイルの `mcp.json` のキーは `mcpServers` ではなく `servers` です：' },
      { code: 'vscode.json' },
    ],
    codex: [
      { code: 'codex.sh' },
      {
        p: 'または `~/.codex/config.toml` に追加します（IDE 拡張と ChatGPT デスクトップアプリも同じファイルを使います）：',
      },
      { code: 'codex.toml' },
    ],
    'gemini-cli': [
      { code: 'gemini.sh' },
      { p: 'または `~/.gemini/settings.json` で `httpUrl` を使います（Gemini では `url` は古い SSE を意味します）：' },
      { code: 'gemini.json' },
    ],
  },
  docs: 'ドキュメント：',
  other: {
    id: 'other',
    heading: 'その他のアプリ',
    blocks: [
      {
        p:
          'URL、Streamable HTTP、認証なしでリモート MCP サーバーを追加してください。多くのアプリ（Trae、Kiro、LM Studio、' +
          'Windsurf、JetBrains AI Assistant）はこの JSON を受け付けます：',
      },
      { code: 'mcpservers.json' },
      { p: 'ローカル（stdio）のサーバーしか使えないアプリは `mcp-remote` 経由で接続できます（Node.js が必要）：' },
      { code: 'mcp-remote.json' },
    ],
  },
  tryIt: {
    id: 'try',
    heading: '試してみる',
    blocks: [
      { p: '日本語、English、简体中文、繁體中文のどれで聞いても大丈夫です。曲名、別名、愛称で探せます。' },
      {
        items: [
          '「bbb」ってどの曲？ 各譜面のレベルも教えて。',
          'PANDORA PARADOXXX の Re:MASTER の譜面定数を、日本版・インターナショナル版・中国版で比べて。',
          'インターナショナル版で、レベル 14 の中で定数が一番低い譜面は？',
          '系ぎて の MASTER で 100.5% だとレートはいくつ？ 300 にするには何％必要？',
          '私のベストスコアはこれ：… レートはいくつで、どの譜面から上げるといい？',
          'PANDORA PARADOXXX の MASTER の定数はバージョンごとに変わった？',
        ],
      },
      {
        p:
          '**動作の確認：**「DXRating を使って、系ぎて の MASTER の譜面定数を教えて」と聞いてみてください。サーバーとバージョンを' +
          '示し、DXRating をクレジットしていれば正常です。ツールを使わずに答えた場合は「DXRating のツールを使って」と伝えてください。',
      },
    ],
  },
  toolsHeading: 'ツール',
  toolsIntro: 'すべて読み取り専用です。公開の楽曲データを読むだけで、アカウントを見たり変えたりはできません。',
  toolHead: ['ツール', '内容'],
  tools: {
    search_songs: '曲名・別名・愛称・ローマ字・アーティストで楽曲を探し、各譜面のレベルを返す',
    get_sheet: '楽曲と譜面の詳細：現在と過去のバージョンの譜面定数、ノーツ数、譜面作者、サーバー、タグ',
    calculate_rating: '譜面と達成率からレート、目標レートに必要な達成率、各ランクのレート',
    calculate_best50: '貼り付けたスコアからレート：新曲枠 15 と旧曲枠 35、伸ばすべき譜面',
  },
  data: {
    id: 'data',
    heading: 'データとライセンス',
    blocks: [
      {
        items: [
          '楽曲・譜面・別名・タグは DXRating（dxrating.net）のもので、ゲームのアップデートごとに更新されます。譜面定数はサーバー' +
            'によって違うことがあります：jp（日本）、intl（インターナショナル）、usa、cn。アシスタントがどれか聞くか、jp を使います。',
          'ツールが受け取り返す達成率は 1/10000 % 単位の整数です：100.7543% は `1007543`。変換はアシスタントがします。',
          'レートはゲームと同じ計算です：ベスト枠は現行バージョンの上位 15 譜面と、それ以前の上位 35 譜面。AP と AP+ は 1 加算されます。',
          'ライセンス：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)。非営利で、クレジット ' +
            '`Data: DXRating (https://dxrating.net), CC BY-NC 4.0` を付けて使えます。サーバーはアシスタントにこれを付けるよう伝えています。',
        ],
      },
    ],
  },
  limits: {
    id: 'limits',
    heading: '制限',
    blocks: [
      {
        items: [
          'IP アドレスごとに 1 分あたり {limit} リクエスト。質問 1 つで通常 1〜4 リクエストです。',
          '超えると「Too many requests. Retry in N seconds.」と返します。その秒数待ってから再試行してください。',
          'Claude.ai と ChatGPT は各社のサーバーから接続するため、利用者どうしで制限を共有することがあります。',
          'ベスト枠の計算は 1 回につきスコア 300 件までです。',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    heading: 'プライバシー',
    blocks: [
      {
        items: [
          'アカウント、キー、Cookie はありません。このページは外部のスクリプトを読み込まず、アクセス解析もしていません。',
          'サーバーが受け取るのはアシスタントが送るもの、つまりツール名と引数（曲名や貼り付けたスコアなど）だけです。会話は見えず、' +
            'スコアも保存しません。',
          'リクエストごとに時刻、パス、ステータス、所要時間、リクエストヘッダー（IP アドレスと User-Agent を含む）を記録します。' +
            'ツールの引数が入る本文は記録しません。記録は監視サービス（Sentry）に送られ、運用と不正利用の防止にだけ使います。',
          'リクエストは Cloudflare を通り、Cloudflare の規約に従って処理されます。',
        ],
      },
    ],
  },
  troubleshooting: {
    id: 'troubleshooting',
    heading: 'うまくいかないとき',
    blocks: [
      {
        items: [
          '**接続できない、SSE のエラー、405：** アプリが古い SSE で接続しようとしています。このサーバーは対応していません。' +
            'Streamable HTTP を選んでください：Cherry Studio は `"type": "streamableHttp"`、Gemini CLI は `httpUrl`。',
          '**サインインを求められる：** サインインは不要です。「サインインなし」「No authentication」を選んでください。',
          '**ブラウザで `/mcp` を開くとこのページになる：** 正常です。エンドポイントは AI アプリからの POST だけを受け付けます。',
          '**「still loading its song catalog」：** サーバーが再起動した直後です。1 分ほどして再試行してください。',
          '**追加したのにツールが使われない：** チャットでコネクタをオンにし、「DXRating を使って」と伝えてください。',
        ],
      },
      {
        p: '**AI なしで試す：** `npx @modelcontextprotocol/inspector` を実行し、Streamable HTTP を選んで URL を入れます。または：',
      },
      { code: 'curl.sh' },
    ],
  },
  links: {
    id: 'links',
    heading: 'リンク',
    blocks: [
      {
        items: [
          'Web サイト：{site}',
          'この案内の Markdown：{md} · エージェント向け：{llms}',
          'サーバーカード：{card}',
          'ソースコード：{repo}（apps/backend/src/services/mcp）',
          '問題の報告：{repo}/issues',
        ],
      },
    ],
  },
  footer:
    '手順は 2026 年 10 月に各アプリのドキュメントで確認しました。アプリのメニューはよく変わります。古くなっていたら' +
    '[Issue を開いて]({repo}/issues)ください。',
  otherLanguages: 'ほかの言語',
  ui: {
    abbr: '日',
    home: 'DXRating ホーム',
    skip: '本文へスキップ',
    pageNav: 'このページの内容',
    langNav: '言語',
    appNav: 'アプリ',
    markdown: 'Markdown',
    copy: 'コピー',
    copied: 'コピーしました',
    copyPrompt: 'エージェント用プロンプトをコピー',
  },
}

const zhHans: GuideText = {
  lang: 'zh-Hans',
  name: '简体中文',
  title: 'DXRating MCP 服务器',
  description:
    '让 AI 助手查 maimai DX 的歌曲、定数，算 Rating：免费、只读的 MCP 服务器，不用账号也不用 API Key。介绍如何添加到 Claude、' +
    'ChatGPT、Cursor、VS Code、Cherry Studio 等应用。',
  lead: [
    '让 AI 助手懂 maimai DX。连上这个服务器后，Claude、ChatGPT、Cursor、VS Code、Cherry Studio 等 AI 应用就能用曲名或别名' +
      '查 DXRating（dxrating.net）的歌曲和谱面，查日服、国际服、美服和国服的定数（譜面定数），并计算 Rating 和 B50。',
    'MCP（Model Context Protocol）是 AI 应用连接外部工具的标准方式。',
  ],
  badges: '免费 · 无需账号 · 无需 API Key · 只读',
  agentHeading: '让你的 Agent 来装',
  agentIntro: '把下面这段粘贴给 Claude Code、Codex、Cursor 等编程 Agent：',
  agentPrompt:
    'Add the DXRating MCP server to this agent: URL {url}, transport Streamable HTTP, no authentication. Follow the ' +
    'steps for this client in {llms}, add it at user (global) scope, then list its tools to confirm it works.',
  installHeading: '添加',
  urlLabel: '服务器 URL',
  facts: [
    ['传输方式', 'Streamable HTTP（不是 SSE）'],
    ['认证', '无。应用问的话选「无需认证」或「No authentication」。'],
    ['建议名称', '`dxrating`'],
  ],
  urlNote: 'URL 要和上面完全一致，以 `/mcp` 结尾。本页（{guide}）是说明页，不是服务器本身。',
  oneClick: '一键添加：',
  addTo: '添加到 %s',
  oneClickNote: '会打开应用并填好服务器，你确认后才会添加。',
  chatApps: '聊天应用',
  codingTools: '编程工具',
  apps: {
    claude: [
      {
        steps: [
          '打开 [添加到 Claude]({claude.link})，或进入 **Customize → Connectors → + Add → Add custom connector**。',
          '名称：`DXRating`。Remote MCP server URL：`{url}`。点 **Continue**。',
          '**Authentication** 选 **No sign in**，再点 **Add**。',
          '在对话里点 **+ → Connectors**，打开 DXRating。',
        ],
      },
      {
        p:
          '免费版只能加一个自定义连接器。Team 和 Enterprise 版由管理员在 **Organization settings → Connectors** 添加，成员再点 ' +
          '**Connect**。手机 App 不能添加连接器，在网页或桌面端添加后会同步过去。',
      },
    ],
    chatgpt: [
      {
        steps: [
          '打开 https://chatgpt.com/plugins，点 **+**，再点 **Add custom MCP server**。',
          '名称 `DXRating`，Server URL `{url}`。',
          'Authentication 选 **No authentication**。看完提示后点 **I understand and want to continue**，再点 **Create as a plugin**。',
          '安装插件。在对话里输入 **@** 并选择 DXRating。',
        ],
      },
      { p: '能否使用取决于你的套餐和工作区设置。' },
    ],
    'cherry-studio': [
      {
        p:
          '一键添加：[添加到 Cherry Studio]({cherry-studio.link})。添加后服务器默认是关闭的，确认后再打开。手动添加：**设置 → MCP → ' +
          'MCP 服务器 → 添加 → 从 JSON 导入**，粘贴：',
      },
      { code: 'streamable.json' },
      { p: '保留 `"type": "streamableHttp"`。少了它 Cherry Studio 会用旧的 SSE 连接，然后失败。' },
    ],
    'claude-code': [
      { code: 'claude-code.sh' },
      { p: '用 `claude mcp list` 或 `/mcp` 检查。项目里的 `.mcp.json` 要写上 `"type": "http"`：' },
      { code: 'claude-code.json' },
    ],
    cursor: [{ p: '[添加到 Cursor]({cursor.link})，或写进 `~/.cursor/mcp.json`：' }, { code: 'mcpservers.json' }],
    vscode: [
      { p: '[添加到 VS Code]({vscode.link})，或运行：' },
      { code: 'vscode.sh' },
      { p: '`.vscode/mcp.json` 和用户配置里的 `mcp.json` 顶层键是 `servers`，不是 `mcpServers`：' },
      { code: 'vscode.json' },
    ],
    codex: [
      { code: 'codex.sh' },
      { p: '或写进 `~/.codex/config.toml`（IDE 插件和 ChatGPT 桌面版共用这个文件）：' },
      { code: 'codex.toml' },
    ],
    'gemini-cli': [
      { code: 'gemini.sh' },
      { p: '或在 `~/.gemini/settings.json` 里用 `httpUrl`（在 Gemini 里 `url` 表示旧的 SSE）：' },
      { code: 'gemini.json' },
    ],
  },
  docs: '文档：',
  other: {
    id: 'other',
    heading: '其他应用',
    blocks: [
      {
        p:
          '用这个 URL 添加远程 MCP 服务器，选 Streamable HTTP、无需认证。大多数应用（Trae、Kiro、LM Studio、Windsurf、JetBrains ' +
          'AI Assistant）都接受这段 JSON：',
      },
      { code: 'mcpservers.json' },
      { p: '只支持本地（stdio）服务器的应用可以通过 `mcp-remote` 连接（需要 Node.js）：' },
      { code: 'mcp-remote.json' },
    ],
  },
  tryIt: {
    id: 'try',
    heading: '试试看',
    blocks: [
      { p: '用中文、日本語、English 问都可以。曲名、别名、外号都能搜到。' },
      {
        items: [
          '「潘」是哪首歌？列出它各难度的等级。',
          'PANDORA PARADOXXX 的白谱定数在日服、国际服和国服分别是多少？',
          '国际服 14 级里定数最低的谱面有哪些？',
          '系ぎて 紫谱 100.5% 是多少 Rating？想拿 300 要打多少？',
          '这是我的最好成绩：…… 我的 Rating 是多少，先推哪些谱面？',
          'PANDORA PARADOXXX 紫谱的定数在各版本有没有变过？',
        ],
      },
      {
        p:
          '**确认能用：** 问「用 DXRating 查一下 系ぎて 紫谱的定数」。好的回答会说明是哪个服务器和版本，并注明数据来自 DXRating。' +
          '如果助手没调用工具就回答了，跟它说「用 DXRating 的工具」。',
      },
    ],
  },
  toolsHeading: '工具',
  toolsIntro: '所有工具都是只读的。只读取公开的歌曲数据，看不到也改不了任何账号。',
  toolHead: ['工具', '用途'],
  tools: {
    search_songs: '按曲名、别名、外号、罗马字或曲师搜歌，附带每张谱面的等级',
    get_sheet: '歌曲和谱面详情：当前和历代版本的定数、物量、谱师、所在服务器、标签',
    calculate_rating: '某谱面某达成率的 Rating、达到目标 Rating 所需的达成率、各评级的 Rating',
    calculate_best50: '根据贴上的成绩算 Rating：新曲 B15 和旧曲 B35，以及值得推的谱面',
  },
  data: {
    id: 'data',
    heading: '数据和许可',
    blocks: [
      {
        items: [
          '歌曲、谱面、别名和标签来自 DXRating（dxrating.net），随游戏更新而更新。定数可能因服务器而不同：jp（日服）、intl（国际服）、' +
            'usa（美服）和 cn（国服）。助手会问你玩哪个服，否则用 jp。',
          '工具收发的达成率是以 1/10000 % 为单位的整数：100.7543% 就是 `1007543`。助手会帮你换算。',
          'Rating 按游戏规则算：B50 是当前版本最好的 15 张谱面加上旧版本最好的 35 张。AP 和 AP+ 每张谱面加 1。',
          '许可：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)，可非商业使用，需注明 ' +
            '`Data: DXRating (https://dxrating.net), CC BY-NC 4.0`。服务器会提醒助手附上这一行。',
        ],
      },
    ],
  },
  limits: {
    id: 'limits',
    heading: '限制',
    blocks: [
      {
        items: [
          '每个 IP 地址每分钟 {limit} 次请求。一个问题通常需要 1 到 4 次请求。',
          '超过限制时服务器会回复「Too many requests. Retry in N seconds.」，等这么多秒后再试。',
          'Claude.ai 和 ChatGPT 从各自公司的服务器连接，所以它们的用户可能共用一个限额。',
          'B50 每次最多算 300 条成绩。',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    heading: '隐私',
    blocks: [
      {
        items: [
          '没有账号、没有 Key、没有 Cookie。本页不加载任何第三方脚本，也没有统计分析。',
          '服务器只收到助手发来的内容：工具名和参数，比如曲名或你贴的成绩。它看不到你的对话，也不会保存你的成绩。',
          '每个请求会记录时间、路径、状态码、耗时和请求头（包括 IP 地址和 User-Agent），但不记录包含工具参数的请求体。日志发送到' +
            '我们的监控服务（Sentry），只用于运维和防止滥用。',
          '请求会经过 Cloudflare，由 Cloudflare 按其条款处理。',
        ],
      },
    ],
  },
  troubleshooting: {
    id: 'troubleshooting',
    heading: '常见问题',
    blocks: [
      {
        items: [
          '**连不上、SSE 报错或 405：** 应用可能在用旧的 SSE 传输方式，本服务器不支持。请选 Streamable HTTP：Cherry Studio 里写 ' +
            '`"type": "streamableHttp"`，Gemini CLI 里用 `httpUrl`。',
          '**应用要求登录：** 不需要登录。选「No sign in」或「No authentication」。',
          '**在浏览器打开 `/mcp` 跳到了这里：** 这是正常的。这个地址只接受 AI 应用的 POST 请求。',
          '**提示「still loading its song catalog」：** 服务器刚重启，过一分钟再试。',
          '**添加了但助手不用：** 在对话里打开连接器，并说「用 DXRating」。',
        ],
      },
      { p: '**不用 AI 测试：** 运行 `npx @modelcontextprotocol/inspector`，选 Streamable HTTP 并填入 URL。或者：' },
      { code: 'curl.sh' },
    ],
  },
  links: {
    id: 'links',
    heading: '链接',
    blocks: [
      {
        items: [
          '网站：{site}',
          '本页的 Markdown：{md} · 给 Agent 的：{llms}',
          'Server card：{card}',
          '源代码：{repo}（apps/backend/src/services/mcp）',
          '反馈问题：{repo}/issues',
        ],
      },
    ],
  },
  footer: '步骤于 2026 年 10 月按各应用的文档核对。应用的菜单经常变，如果哪一步过时了，请[提 Issue]({repo}/issues)。',
  otherLanguages: '其他语言',
  ui: {
    abbr: '简',
    home: 'DXRating 首页',
    skip: '跳到正文',
    pageNav: '本页内容',
    langNav: '语言',
    appNav: '应用',
    markdown: 'Markdown',
    copy: '复制',
    copied: '已复制',
    copyPrompt: '复制给 AI 的安装指令',
  },
}

const zhHant: GuideText = {
  lang: 'zh-Hant',
  name: '繁體中文',
  title: 'DXRating MCP 伺服器',
  description:
    '讓 AI 助理查 maimai DX 的歌曲、定數，算 Rating：免費、唯讀的 MCP 伺服器，不需帳號也不需 API Key。說明如何加入 Claude、' +
    'ChatGPT、Cursor、VS Code、Cherry Studio 等應用程式。',
  lead: [
    '讓 AI 助理懂 maimai DX。連上這個伺服器後，Claude、ChatGPT、Cursor、VS Code、Cherry Studio 等 AI 應用程式就能用曲名或' +
      '別名查詢 DXRating（dxrating.net）的歌曲和譜面，查日版、國際版、美版和國服的定數（譜面定数），並計算 Rating 和 B50。',
    'MCP（Model Context Protocol）是 AI 應用程式連接外部工具的標準方式。',
  ],
  badges: '免費 · 不需帳號 · 不需 API Key · 唯讀',
  agentHeading: '讓你的 Agent 來設定',
  agentIntro: '把下面這段貼給 Claude Code、Codex、Cursor 等程式 Agent：',
  agentPrompt:
    'Add the DXRating MCP server to this agent: URL {url}, transport Streamable HTTP, no authentication. Follow the ' +
    'steps for this client in {llms}, add it at user (global) scope, then list its tools to confirm it works.',
  installHeading: '加入',
  urlLabel: '伺服器 URL',
  facts: [
    ['傳輸方式', 'Streamable HTTP（不是 SSE）'],
    ['驗證', '無。應用程式詢問時選「不需驗證」或「No authentication」。'],
    ['建議名稱', '`dxrating`'],
  ],
  urlNote: 'URL 請和上面完全相同，以 `/mcp` 結尾。本頁（{guide}）是說明頁，不是伺服器本身。',
  oneClick: '一鍵加入：',
  addTo: '加入 %s',
  oneClickNote: '會開啟應用程式並填好伺服器，你確認後才會加入。',
  chatApps: '聊天應用程式',
  codingTools: '程式開發工具',
  apps: {
    claude: [
      {
        steps: [
          '開啟 [加入 Claude]({claude.link})，或進入 **Customize → Connectors → + Add → Add custom connector**。',
          '名稱：`DXRating`。Remote MCP server URL：`{url}`。按 **Continue**。',
          '**Authentication** 選 **No sign in**，再按 **Add**。',
          '在對話中按 **+ → Connectors**，開啟 DXRating。',
        ],
      },
      {
        p:
          '免費方案只能加一個自訂連接器。Team 和 Enterprise 方案由管理者在 **Organization settings → Connectors** 加入，成員再按 ' +
          '**Connect**。手機 App 不能加入連接器，在網頁或桌面版加入後會同步過去。',
      },
    ],
    chatgpt: [
      {
        steps: [
          '開啟 https://chatgpt.com/plugins，按 **+**，再按 **Add custom MCP server**。',
          '名稱 `DXRating`，Server URL `{url}`。',
          'Authentication 選 **No authentication**。看完提示後按 **I understand and want to continue**，再按 **Create as a plugin**。',
          '安裝外掛。在對話中輸入 **@** 並選擇 DXRating。',
        ],
      },
      { p: '能否使用取決於你的方案和工作區設定。' },
    ],
    'cherry-studio': [
      {
        p:
          '一鍵加入：[加入 Cherry Studio]({cherry-studio.link})。加入後伺服器預設是關閉的，確認後再開啟。手動加入：**設定 → MCP → ' +
          'MCP 伺服器 → 新增 → 從 JSON 匯入**，貼上：',
      },
      { code: 'streamable.json' },
      { p: '請保留 `"type": "streamableHttp"`。少了它 Cherry Studio 會用舊的 SSE 連線，然後失敗。' },
    ],
    'claude-code': [
      { code: 'claude-code.sh' },
      { p: '用 `claude mcp list` 或 `/mcp` 檢查。專案的 `.mcp.json` 要寫上 `"type": "http"`：' },
      { code: 'claude-code.json' },
    ],
    cursor: [{ p: '[加入 Cursor]({cursor.link})，或寫進 `~/.cursor/mcp.json`：' }, { code: 'mcpservers.json' }],
    vscode: [
      { p: '[加入 VS Code]({vscode.link})，或執行：' },
      { code: 'vscode.sh' },
      { p: '`.vscode/mcp.json` 和使用者設定的 `mcp.json` 最上層的鍵是 `servers`，不是 `mcpServers`：' },
      { code: 'vscode.json' },
    ],
    codex: [
      { code: 'codex.sh' },
      { p: '或寫進 `~/.codex/config.toml`（IDE 擴充功能和 ChatGPT 桌面版共用這個檔案）：' },
      { code: 'codex.toml' },
    ],
    'gemini-cli': [
      { code: 'gemini.sh' },
      { p: '或在 `~/.gemini/settings.json` 裡用 `httpUrl`（在 Gemini 裡 `url` 代表舊的 SSE）：' },
      { code: 'gemini.json' },
    ],
  },
  docs: '文件：',
  other: {
    id: 'other',
    heading: '其他應用程式',
    blocks: [
      {
        p:
          '用這個 URL 加入遠端 MCP 伺服器，選 Streamable HTTP、不需驗證。多數應用程式（Trae、Kiro、LM Studio、Windsurf、' +
          'JetBrains AI Assistant）都接受這段 JSON：',
      },
      { code: 'mcpservers.json' },
      { p: '只支援本機（stdio）伺服器的應用程式可以透過 `mcp-remote` 連線（需要 Node.js）：' },
      { code: 'mcp-remote.json' },
    ],
  },
  tryIt: {
    id: 'try',
    heading: '試試看',
    blocks: [
      { p: '用中文、日本語、English 問都可以。曲名、別名、暱稱都找得到。' },
      {
        items: [
          '「潘」是哪首歌？列出它各難度的等級。',
          'PANDORA PARADOXXX 的白譜定數在日版、國際版和國服分別是多少？',
          '國際版 14 級裡定數最低的譜面有哪些？',
          '系ぎて 紫譜 100.5% 是多少 Rating？想拿 300 要打多少？',
          '這是我的最佳成績：…… 我的 Rating 是多少，先推哪些譜面？',
          'PANDORA PARADOXXX 紫譜的定數在各版本有沒有變過？',
        ],
      },
      {
        p:
          '**確認能用：** 問「用 DXRating 查一下 系ぎて 紫譜的定數」。好的回答會說明是哪個伺服器和版本，並註明資料來自 DXRating。' +
          '如果助理沒有呼叫工具就回答，跟它說「用 DXRating 的工具」。',
      },
    ],
  },
  toolsHeading: '工具',
  toolsIntro: '所有工具都是唯讀的。只讀取公開的歌曲資料，看不到也改不了任何帳號。',
  toolHead: ['工具', '用途'],
  tools: {
    search_songs: '依曲名、別名、暱稱、羅馬字或曲師搜尋歌曲，附上每張譜面的等級',
    get_sheet: '歌曲和譜面詳情：目前和歷代版本的定數、物量、譜師、所在伺服器、標籤',
    calculate_rating: '某譜面某達成率的 Rating、達到目標 Rating 所需的達成率、各評級的 Rating',
    calculate_best50: '依貼上的成績算 Rating：新曲 B15 和舊曲 B35，以及值得推的譜面',
  },
  data: {
    id: 'data',
    heading: '資料與授權',
    blocks: [
      {
        items: [
          '歌曲、譜面、別名和標籤來自 DXRating（dxrating.net），隨遊戲更新而更新。定數可能因伺服器而不同：jp（日版）、intl（國際版）、' +
            'usa（美版）和 cn（國服）。助理會問你玩哪個版本，否則用 jp。',
          '工具收發的達成率是以 1/10000 % 為單位的整數：100.7543% 就是 `1007543`。助理會幫你換算。',
          'Rating 依遊戲規則計算：B50 是目前版本最好的 15 張譜面加上舊版本最好的 35 張。AP 和 AP+ 每張譜面加 1。',
          '授權：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)，可非商業使用，需註明 ' +
            '`Data: DXRating (https://dxrating.net), CC BY-NC 4.0`。伺服器會提醒助理附上這一行。',
        ],
      },
    ],
  },
  limits: {
    id: 'limits',
    heading: '限制',
    blocks: [
      {
        items: [
          '每個 IP 位址每分鐘 {limit} 次請求。一個問題通常需要 1 到 4 次請求。',
          '超過限制時伺服器會回覆「Too many requests. Retry in N seconds.」，等這麼多秒後再試。',
          'Claude.ai 和 ChatGPT 從各自公司的伺服器連線，所以它們的使用者可能共用一個額度。',
          'B50 每次最多計算 300 筆成績。',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    heading: '隱私',
    blocks: [
      {
        items: [
          '沒有帳號、沒有 Key、沒有 Cookie。本頁不載入任何第三方指令碼，也沒有流量分析。',
          '伺服器只收到助理送來的內容：工具名稱和參數，例如曲名或你貼上的成績。它看不到你的對話，也不會儲存你的成績。',
          '每個請求會記錄時間、路徑、狀態碼、耗時和請求標頭（包括 IP 位址和 User-Agent），但不記錄包含工具參數的請求內容。記錄會' +
            '送到我們的監控服務（Sentry），只用於維運和防止濫用。',
          '請求會經過 Cloudflare，由 Cloudflare 依其條款處理。',
        ],
      },
    ],
  },
  troubleshooting: {
    id: 'troubleshooting',
    heading: '常見問題',
    blocks: [
      {
        items: [
          '**連不上、SSE 錯誤或 405：** 應用程式可能在用舊的 SSE 傳輸方式，本伺服器不支援。請選 Streamable HTTP：Cherry Studio ' +
            '裡寫 `"type": "streamableHttp"`，Gemini CLI 裡用 `httpUrl`。',
          '**應用程式要求登入：** 不需要登入。選「No sign in」或「No authentication」。',
          '**在瀏覽器開啟 `/mcp` 跳到了這裡：** 這是正常的。這個位址只接受 AI 應用程式的 POST 請求。',
          '**出現「still loading its song catalog」：** 伺服器剛重新啟動，過一分鐘再試。',
          '**加入了但助理不用：** 在對話中開啟連接器，並說「用 DXRating」。',
        ],
      },
      { p: '**不用 AI 測試：** 執行 `npx @modelcontextprotocol/inspector`，選 Streamable HTTP 並填入 URL。或者：' },
      { code: 'curl.sh' },
    ],
  },
  links: {
    id: 'links',
    heading: '連結',
    blocks: [
      {
        items: [
          '網站：{site}',
          '本頁的 Markdown：{md} · 給 Agent 的：{llms}',
          'Server card：{card}',
          '原始碼：{repo}（apps/backend/src/services/mcp）',
          '回報問題：{repo}/issues',
        ],
      },
    ],
  },
  footer:
    '步驟於 2026 年 10 月依各應用程式的文件核對。應用程式的選單經常變動，如果哪一步過時了，請[開 Issue]({repo}/issues)。',
  otherLanguages: '其他語言',
  ui: {
    abbr: '繁',
    home: 'DXRating 首頁',
    skip: '跳到正文',
    pageNav: '本頁內容',
    langNav: '語言',
    appNav: '應用程式',
    markdown: 'Markdown',
    copy: '複製',
    copied: '已複製',
    copyPrompt: '複製給 AI 的安裝指令',
  },
}

/** The texts, in the order of the language switch; the first is the default */
export const GUIDE_TEXTS: readonly GuideText[] = [en, ja, zhHans, zhHant]

/** The preface of llms.txt, for agents */
export const LLMS_PREFACE = [
  '> Read-only remote MCP server for maimai DX song data, internal levels and ratings (jp, intl, usa, cn servers). ' +
    'URL: {url} · Streamable HTTP · no authentication · {toolcount} tools. Data: CC BY-NC 4.0, credit "Data: ' +
    'DXRating (https://dxrating.net), CC BY-NC 4.0". Achievements are integers in 1/10000 %: 100.7543% is 1007543.',
  'If you are an AI agent asked to connect this server: use the exact URL above (it ends in /mcp), pick the section ' +
    'for the client you run in, add it at user/global scope, then list the tools ({tools}) to verify.',
]