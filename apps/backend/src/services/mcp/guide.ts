import { createHash } from 'node:crypto'
import {
  APP_DOCS,
  APP_NAMES,
  CHAT_APPS,
  CODING_TOOLS,
  GUIDE_TEXTS,
  LLMS_PREFACE,
  type AppId,
  type Block,
  type GuideText,
  type Section,
} from './guide-text'
import { MCP_GUIDE_URL, MCP_HOST, MCP_PUBLIC_URL, MCP_SERVER_CARD_URL, REPOSITORY } from './listing'
import { ICONS, SITE_URL } from './output'

// The setup guide of the MCP server, at the root of its host (mcp.dxrating.net): how to add the server to Claude,
// ChatGPT, Cursor, VS Code and other apps, what its tools do, its data, limits and privacy. It is in the languages of
// the web app (guide-text.ts), as HTML for people and as Markdown for agents, with llms.txt and robots.txt for the
// host. Everything is rendered once, on the first request. The HTML loads nothing but the icon of the site and has
// no script; its Content-Security-Policy allows its style by its hash.
//
// The guide is served to its host only: the backend answers other hosts too, whose root redirects to the API docs.
// An MCP client given the URL of the guide instead of the endpoint is helped on: its POST is redirected to the
// endpoint with a 307, which keeps the method and the body.

export const GUIDE_MARKDOWN_PATH = '/index.md'
export const GUIDE_LLMS_PATH = '/llms.txt'
export const GUIDE_ROBOTS_PATH = '/robots.txt'

/** The rate limit the guide states, which app.ts applies */
const RATE_LIMIT_PER_MINUTE = 300

/**
 * The commands and configuration the guide gives, by name, with {url} for the endpoint. The extension of a name is
 * the language of the snippet. The keys and the transports are the apps' own: a wrong key is the commonest silent
 * failure.
 */
const SNIPPETS: Record<string, string> = {
  // Cursor, Trae, Kiro, LM Studio, Windsurf and the JetBrains AI Assistant
  'mcpservers.json': '{"mcpServers":{"dxrating":{"url":"{url}"}}}',
  // Cherry Studio takes a url without a type for the old SSE transport
  'streamable.json': '{"mcpServers":{"dxrating":{"type":"streamableHttp","url":"{url}"}}}',
  'claude-code.sh': 'claude mcp add --transport http --scope user dxrating {url}',
  'claude-code.json': '{"mcpServers":{"dxrating":{"type":"http","url":"{url}"}}}',
  'vscode.sh': `code --add-mcp '{"name":"dxrating","type":"http","url":"{url}"}'`,
  // .vscode/mcp.json and the user-profile mcp.json: servers, not mcpServers
  'vscode.json': '{"servers":{"dxrating":{"type":"http","url":"{url}"}}}',
  'codex.sh': 'codex mcp add dxrating --url {url}',
  'codex.toml': '[mcp_servers.dxrating]\nurl = "{url}"',
  // the project is the default scope of Gemini CLI
  'gemini.sh': 'gemini mcp add --transport http -s user dxrating {url}',
  // in Gemini CLI, url is the old SSE transport, httpUrl Streamable HTTP
  'gemini.json': '{"mcpServers":{"dxrating":{"httpUrl":"{url}"}}}',
  // for apps that run local (stdio) servers only
  'mcp-remote.json':
    '{"mcpServers":{"dxrating":{"command":"npx","args":["-y","mcp-remote","{url}","--transport","http-only"]}}}',
  'curl.sh':
    "curl -s {url} -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' " +
    `-H 'Mcp-Protocol-Version: 2025-06-18' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
}

const base64 = (s: string) => Buffer.from(s).toString('base64')

/**
 * The one-click links: each opens its app with the server filled in, for the user to review and confirm. The web links
 * (cursor.com, vscode.dev) rather than custom schemes where an app has both, which work wherever the app is installed.
 */
const ONE_CLICK: Partial<Record<AppId, { name: string; link: (url: string) => string }>> = {
  claude: {
    name: 'Claude',
    link: (url) =>
      'https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=DXRating&connectorUrl=' +
      encodeURIComponent(url),
  },
  cursor: {
    name: 'Cursor',
    link: (url) =>
      'https://cursor.com/en/install-mcp?name=dxrating&config=' + encodeURIComponent(base64(JSON.stringify({ url }))),
  },
  vscode: {
    name: 'VS Code',
    link: (url) =>
      'https://vscode.dev/redirect/mcp/install?name=dxrating&config=' +
      encodeURIComponent(JSON.stringify({ type: 'http', url })),
  },
  'cherry-studio': {
    name: 'Cherry Studio',
    link: (url) =>
      'cherrystudio://mcp/install?servers=' +
      encodeURIComponent(base64(SNIPPETS['streamable.json'].replaceAll('{url}', url))),
  },
}

/** The tools the guide lists, in its order */
export const GUIDE_TOOLS = Object.keys(GUIDE_TEXTS[0].tools)

const PLACEHOLDER = /\{([a-z][a-z0-9.-]*)\}/g

/** The values of the placeholders of the texts */
function placeholders(text: GuideText): Map<string, string> {
  const url = MCP_PUBLIC_URL
  const values = new Map<string, string>([
    ['url', url],
    ['guide', MCP_GUIDE_URL],
    ['md', `${origin()}${GUIDE_MARKDOWN_PATH}?lang=${text.lang}`],
    ['llms', `${origin()}${GUIDE_LLMS_PATH}`],
    ['card', MCP_SERVER_CARD_URL],
    ['site', SITE_URL],
    ['repo', REPOSITORY.url],
    ['limit', String(RATE_LIMIT_PER_MINUTE)],
    ['tools', GUIDE_TOOLS.join(', ')],
    ['toolcount', String(GUIDE_TOOLS.length)],
  ])
  for (const [name, snippet] of Object.entries(SNIPPETS)) values.set(name, snippet.replaceAll('{url}', url))
  for (const [id, app] of Object.entries(ONE_CLICK)) values.set(`${id}.link`, app.link(url))
  return values
}

const origin = () => MCP_GUIDE_URL.replace(/\/$/, '')

/** s with its placeholders filled in; an unknown one is a typo in a text, and fails the rendering */
function expander(text: GuideText) {
  const values = placeholders(text)
  return (s: string) =>
    s.replace(PLACEHOLDER, (match, name: string) => {
      const value = values.get(name)
      if (value === undefined) throw new Error(`guide (${text.lang}): unknown placeholder ${match}`)
      return value
    })
}

/** A snippet as a code block shows it: JSON indented */
function snippetBlock(name: string): { lang: string; code: string } {
  const snippet = SNIPPETS[name]
  if (snippet === undefined) throw new Error(`guide: unknown snippet ${name}`)
  const lang = name.slice(name.lastIndexOf('.') + 1)
  const code = snippet.replaceAll('{url}', MCP_PUBLIC_URL)
  return { lang, code: lang === 'json' ? JSON.stringify(JSON.parse(code), null, 2) : code }
}

// -- Markdown --

function markdownBlocks(blocks: Block[], expand: (s: string) => string): string {
  return blocks
    .map((block) => {
      if ('p' in block) return expand(block.p)
      if ('items' in block) return block.items.map((item) => `- ${expand(item)}`).join('\n')
      if ('steps' in block) return block.steps.map((step, i) => `${i + 1}. ${expand(step)}`).join('\n')
      const { lang, code } = snippetBlock(block.code)
      return `\`\`\`${lang}\n${code}\n\`\`\``
    })
    .join('\n\n')
}

function renderMarkdown(text: GuideText, llms: boolean): string {
  const expand = expander(text)
  const section = (s: Section) => `## ${s.heading}\n\n${markdownBlocks(s.blocks, expand)}`
  const app = (id: AppId) =>
    `#### ${APP_NAMES[id]}\n\n${markdownBlocks(text.apps[id], expand)}\n\n${text.docs}${APP_DOCS[id]}`
  const oneClick = Object.entries(ONE_CLICK)
    .map(([, a]) => `[${text.addTo.replace('%s', a.name)}](${a.link(MCP_PUBLIC_URL)})`)
    .join(' · ')
  const parts = [
    `# ${text.title}`,
    ...(llms ? LLMS_PREFACE.map(expand) : []),
    ...text.lead.map(expand),
    `**${text.badges}**`,
    `## ${text.agentHeading}`,
    expand(text.agentIntro),
    `\`\`\`text\n${expand(text.agentPrompt)}\n\`\`\``,
    `## ${text.installHeading}`,
    ['| | |', '|---|---|', `| ${text.urlLabel} | \`${MCP_PUBLIC_URL}\` |`]
      .concat(text.facts.map(([label, value]) => `| ${label} | ${expand(value)} |`))
      .join('\n'),
    expand(text.urlNote),
    ...(llms ? [] : [`**${text.oneClick}** ${oneClick}`, expand(text.oneClickNote)]),
    `### ${text.chatApps}`,
    ...CHAT_APPS.map(app),
    `### ${text.codingTools}`,
    ...CODING_TOOLS.map(app),
    `### ${text.other.heading}\n\n${markdownBlocks(text.other.blocks, expand)}`,
    section(text.tryIt),
    `## ${text.toolsHeading}`,
    expand(text.toolsIntro),
    [`| ${text.toolHead[0]} | ${text.toolHead[1]} |`, '|---|---|']
      .concat(GUIDE_TOOLS.map((name) => `| \`${name}\` | ${expand(text.tools[name])} |`))
      .join('\n'),
    section(text.data),
    section(text.limits),
    section(text.privacy),
    section(text.troubleshooting),
    section(text.links),
    '---',
    expand(text.footer),
    ...(llms
      ? []
      : [
          `${text.otherLanguages}: ` +
            GUIDE_TEXTS.map((t) => `[${t.name}](${origin()}${GUIDE_MARKDOWN_PATH}?lang=${t.lang})`).join(' · '),
        ]),
  ]
  return `${parts.join('\n\n')}\n`
}

// -- HTML --

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Code spans, bold, links and bare URLs (which end before CJK punctuation and do not take a final period) */
const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()（）、，。：「」]*[^\s<>()（）、，。：「」.,;:!?])/g

/** A line of the texts, expanded, as HTML */
function inlineHtml(s: string): string {
  let html = ''
  let last = 0
  for (const match of s.matchAll(INLINE)) {
    html += escapeHtml(s.slice(last, match.index))
    const [whole, code, bold, label, href, bare] = match
    if (code !== undefined) html += `<code>${escapeHtml(code)}</code>`
    else if (bold !== undefined) html += `<strong>${inlineHtml(bold)}</strong>`
    else if (label !== undefined) html += `<a href="${escapeHtml(href)}">${inlineHtml(label)}</a>`
    else html += `<a href="${escapeHtml(bare)}">${escapeHtml(bare)}</a>`
    last = match.index + whole.length
  }
  return html + escapeHtml(s.slice(last))
}

function htmlBlocks(blocks: Block[], expand: (s: string) => string): string {
  return blocks
    .map((block) => {
      if ('p' in block) return `<p>${inlineHtml(expand(block.p))}</p>`
      if ('items' in block) return `<ul>${block.items.map((i) => `<li>${inlineHtml(expand(i))}</li>`).join('')}</ul>`
      if ('steps' in block) return `<ol>${block.steps.map((i) => `<li>${inlineHtml(expand(i))}</li>`).join('')}</ol>`
      const { lang, code } = snippetBlock(block.code)
      return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`
    })
    .join('\n')
}

const CSS = `
:root{color-scheme:light dark;--bg:#fbfaff;--fg:#1d1b26;--muted:#5f5b70;--line:#e2deef;--code:#f1eef9;--accent:#6b3fd4}
@media (prefers-color-scheme:dark){:root{--bg:#141219;--fg:#ebe8f4;--muted:#a6a1b8;--line:#2e2a3a;--code:#1f1c28;--accent:#b49bff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,-apple-system,"Segoe UI","Hiragino Sans","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 3rem}
nav{display:flex;flex-wrap:wrap;gap:.25rem .9rem;justify-content:flex-end;font-size:.875rem}
nav a[aria-current]{font-weight:600;color:var(--fg);text-decoration:none}
h1{display:flex;align-items:center;gap:.75rem;font-size:1.9rem;line-height:1.2;margin:1.5rem 0 1rem}
h1 img{width:2.75rem;height:2.75rem;border-radius:.6rem}
h2{font-size:1.35rem;margin:2.5rem 0 .75rem;padding-top:1rem;border-top:1px solid var(--line)}
h3{font-size:1.05rem;margin:1.75rem 0 .5rem}
a{color:var(--accent);overflow-wrap:anywhere}
.badges{color:var(--muted);font-weight:600}
code{font:.875em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code);padding:.1em .3em;border-radius:.3em;overflow-wrap:anywhere}
pre{background:var(--code);padding:.75rem 1rem;border-radius:.5rem;overflow-x:auto}
pre code{padding:0;background:none;white-space:pre;overflow-wrap:normal}
pre.wrap-code code{white-space:pre-wrap}
table{border-collapse:collapse;width:100%;font-size:.95rem}
th,td{text-align:left;vertical-align:top;padding:.45rem .6rem;border-bottom:1px solid var(--line)}
th[scope=row]{white-space:nowrap}
details{border:1px solid var(--line);border-radius:.5rem;padding:.25rem .9rem;margin:.5rem 0}
summary{cursor:pointer;font-weight:600;padding:.4rem 0}
.docs,footer{color:var(--muted);font-size:.875rem}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line)}
`.trim()

const STYLE_HASH = `sha256-${createHash('sha256').update(CSS).digest('base64')}`
const ICON = ICONS[0].src

export const GUIDE_CSP =
  `default-src 'none'; style-src '${STYLE_HASH}'; img-src ${new URL(ICON).origin}; base-uri 'none'; ` +
  "form-action 'none'; frame-ancestors 'none'"

function renderHtml(text: GuideText): string {
  const expand = expander(text)
  const blocks = (b: Block[]) => htmlBlocks(b, expand)
  const section = (s: Section) =>
    `<section id="${s.id}">\n<h2>${escapeHtml(s.heading)}</h2>\n${blocks(s.blocks)}\n</section>`
  const app = (id: AppId) =>
    `<details id="${id}"><summary>${escapeHtml(APP_NAMES[id])}</summary>\n${blocks(text.apps[id])}\n` +
    `<p class="docs">${escapeHtml(text.docs)}<a href="${escapeHtml(APP_DOCS[id])}">${escapeHtml(APP_DOCS[id])}</a></p></details>`
  const page = (t: GuideText) => `${MCP_GUIDE_URL}?lang=${t.lang}`
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(text.title)}</title>`,
    `<meta name="description" content="${escapeHtml(text.description)}">`,
    `<meta property="og:title" content="${escapeHtml(text.title)}">`,
    `<meta property="og:description" content="${escapeHtml(text.description)}">`,
    `<meta property="og:url" content="${escapeHtml(page(text))}">`,
    `<link rel="icon" href="${escapeHtml(ICON)}">`,
    `<link rel="canonical" href="${escapeHtml(page(text))}">`,
    ...GUIDE_TEXTS.map((t) => `<link rel="alternate" hreflang="${t.lang}" href="${escapeHtml(page(t))}">`),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(MCP_GUIDE_URL)}">`,
    `<link rel="alternate" type="text/markdown" href="${escapeHtml(expand('{md}'))}">`,
    `<style>${CSS}</style>`,
  ]
  const nav = GUIDE_TEXTS.map((t) =>
    t === text
      ? `<a href="?lang=${t.lang}" lang="${t.lang}" aria-current="page">${escapeHtml(t.name)}</a>`
      : `<a href="?lang=${t.lang}" lang="${t.lang}" hreflang="${t.lang}">${escapeHtml(t.name)}</a>`,
  ).join('')
  const oneClick = Object.values(ONE_CLICK)
    .map((a) => `<a href="${escapeHtml(a.link(MCP_PUBLIC_URL))}">${escapeHtml(text.addTo.replace('%s', a.name))}</a>`)
    .join(' · ')
  const facts = [[text.urlLabel, `\`${MCP_PUBLIC_URL}\``], ...text.facts]
    .map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${inlineHtml(expand(value))}</td></tr>`)
    .join('')
  const tools = GUIDE_TOOLS.map(
    (name) => `<tr><td><code>${name}</code></td><td>${inlineHtml(expand(text.tools[name]))}</td></tr>`,
  ).join('')
  const body = [
    `<nav aria-label="Language">${nav}</nav>`,
    '<header>',
    `<h1><img src="${escapeHtml(ICON)}" alt="" width="44" height="44">${escapeHtml(text.title)}</h1>`,
    ...text.lead.map((p) => `<p>${inlineHtml(expand(p))}</p>`),
    `<p class="badges">${escapeHtml(text.badges)}</p>`,
    '</header>',
    '<main>',
    `<section id="agent">\n<h2>${escapeHtml(text.agentHeading)}</h2>\n<p>${inlineHtml(expand(text.agentIntro))}</p>`,
    `<pre class="wrap-code"><code>${escapeHtml(expand(text.agentPrompt))}</code></pre>\n</section>`,
    `<section id="install">\n<h2>${escapeHtml(text.installHeading)}</h2>`,
    `<table>${facts}</table>`,
    `<p>${inlineHtml(expand(text.urlNote))}</p>`,
    `<p><strong>${escapeHtml(text.oneClick)}</strong> ${oneClick}</p>`,
    `<p>${inlineHtml(expand(text.oneClickNote))}</p>`,
    `<h3>${escapeHtml(text.chatApps)}</h3>`,
    ...CHAT_APPS.map(app),
    `<h3>${escapeHtml(text.codingTools)}</h3>`,
    ...CODING_TOOLS.map(app),
    `<details id="${text.other.id}"><summary>${escapeHtml(text.other.heading)}</summary>\n${blocks(text.other.blocks)}</details>`,
    '</section>',
    section(text.tryIt),
    `<section id="tools">\n<h2>${escapeHtml(text.toolsHeading)}</h2>\n<p>${inlineHtml(expand(text.toolsIntro))}</p>`,
    `<table><thead><tr><th>${escapeHtml(text.toolHead[0])}</th><th>${escapeHtml(text.toolHead[1])}</th></tr></thead>` +
      `<tbody>${tools}</tbody></table>\n</section>`,
    section(text.data),
    section(text.limits),
    section(text.privacy),
    section(text.troubleshooting),
    section(text.links),
    '</main>',
    `<footer><p>${inlineHtml(expand(text.footer))}</p></footer>`,
  ]
  return `<!doctype html>\n<html lang="${text.lang}">\n<head>\n${head.join('\n')}\n</head>\n<body>\n<div class="wrap">\n${body.join('\n')}\n</div>\n</body>\n</html>\n`
}

/** robots.txt of the host: the guide and the card may be crawled; the endpoint, which only takes POSTs, not */
const ROBOTS =
  `# DXRating MCP server. Setup guide: ${MCP_GUIDE_URL}  For agents: ${origin()}${GUIDE_LLMS_PATH}\n` +
  'User-agent: *\nAllow: /\nAllow: /mcp/server-card\nDisallow: /mcp\n'

interface RenderedGuide {
  pages: Map<string, { html: string; markdown: string }>
  llms: string
}

let rendered: RenderedGuide | undefined

/** The guide in every language, rendered on first use */
export function renderGuide(): RenderedGuide {
  if (rendered) return rendered
  const pages = new Map(GUIDE_TEXTS.map((t) => [t.lang, { html: renderHtml(t), markdown: renderMarkdown(t, false) }]))
  rendered = { pages, llms: renderMarkdown(GUIDE_TEXTS[0], true) }
  return rendered
}

/** The language of a request: ?lang if the guide has it, else the best of Accept-Language, else English */
export function guideLanguage(lang: string | null, acceptLanguage: string | null): GuideText['lang'] {
  const exact = GUIDE_TEXTS.find((t) => t.lang.toLowerCase() === lang?.toLowerCase())
  if (exact) return exact.lang
  const ranges = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [range, ...params] = part.trim().toLowerCase().split(';')
      const q = Number(
        params
          .find((p) => p.trim().startsWith('q='))
          ?.trim()
          .slice(2) ?? 1,
      )
      return { range, q: Number.isFinite(q) ? q : 0, index }
    })
    .filter(({ range, q }) => range && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
  for (const { range } of ranges) {
    if (range === 'ja' || range.startsWith('ja-')) return 'ja'
    if (/^zh-(hant|tw|hk|mo)\b/.test(range)) return 'zh-Hant'
    if (range === 'zh' || range.startsWith('zh-')) return 'zh-Hans'
    if (range === 'en' || range.startsWith('en-')) return 'en'
  }
  return 'en'
}

/** Whether a request is for the host of the server; behind a proxy, the host it forwarded */
export function isMcpHost(headers: Headers): boolean {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim().toLowerCase()
  return host.replace(/:\d+$/, '') === MCP_HOST
}

const LICENSE_LINK = '<https://creativecommons.org/licenses/by-nc/4.0/>; rel="license"'
const CARD_LINK = `<${MCP_SERVER_CARD_URL}>; rel="service-desc"; type="application/mcp-server-card+json"`

/** Whether a request prefers Markdown or plain text to HTML, as agents fetching the page do */
function prefersText(accept: string | null): 'markdown' | 'plain' | undefined {
  const types = (accept ?? '').toLowerCase()
  if (types.includes('text/markdown')) return 'markdown'
  if (types.includes('text/plain') && !types.includes('text/html')) return 'plain'
  return undefined
}

function text(body: string, contentType: string, cacheControl: string, headers: Record<string, string> = {}) {
  return { body, headers: { 'Content-Type': contentType, 'Cache-Control': cacheControl, ...headers } }
}

/**
 * The answer of the guide to a request, or undefined for one that is not for it: another host, or another path. The
 * root is negotiated (HTML, or Markdown for agents asking for it, in the language of ?lang or Accept-Language);
 * /index.md?lang= is the Markdown of a language, /llms.txt the English Markdown with a preface for agents.
 */
export function guideResponse(request: Request): Response | undefined {
  if (!isMcpHost(request.headers)) return undefined
  const url = new URL(request.url)
  const path = url.pathname
  if (![`/`, GUIDE_MARKDOWN_PATH, GUIDE_LLMS_PATH, GUIDE_ROBOTS_PATH].includes(path)) return undefined

  if (request.method === 'POST' && path === '/') {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32600, message: `This is the setup guide. The MCP endpoint is ${MCP_PUBLIC_URL}` },
        id: null,
      }),
      {
        status: 307,
        headers: { Location: MCP_PUBLIC_URL, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    )
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined

  const guide = renderGuide()
  const lang = guideLanguage(url.searchParams.get('lang'), request.headers.get('accept-language'))
  const page = guide.pages.get(lang)!
  const html = `${MCP_GUIDE_URL}?lang=${lang}`
  let response: ReturnType<typeof text>
  if (path === GUIDE_ROBOTS_PATH) {
    response = text(ROBOTS, 'text/plain; charset=utf-8', 'public, max-age=86400')
  } else if (path === GUIDE_LLMS_PATH) {
    response = text(guide.llms, 'text/plain; charset=utf-8', 'public, max-age=3600', {
      'Content-Language': 'en',
      Link: `${LICENSE_LINK}, ${CARD_LINK}`,
    })
  } else if (path === GUIDE_MARKDOWN_PATH) {
    // the same for every request to its URL when ?lang names the language; else negotiated, as the root is
    const byQuery = lang.toLowerCase() === url.searchParams.get('lang')?.toLowerCase()
    response = text(
      page.markdown,
      'text/markdown; charset=utf-8',
      byQuery ? 'public, max-age=3600' : 'private, max-age=300',
      {
        'Content-Language': lang,
        ...(byQuery ? {} : { Vary: 'Accept-Language' }),
        Link: `<${html}>; rel="canonical", ${LICENSE_LINK}, ${CARD_LINK}`,
      },
    )
  } else {
    // the root varies by Accept and Accept-Language: private keeps the variants out of shared caches
    const negotiated = { 'Content-Language': lang, Vary: 'Accept, Accept-Language' }
    const markdownLink = `<${origin()}${GUIDE_MARKDOWN_PATH}?lang=${lang}>; rel="alternate"; type="text/markdown"`
    const kind = prefersText(request.headers.get('accept'))
    response =
      kind === undefined
        ? text(page.html, 'text/html; charset=utf-8', 'private, max-age=300', {
            ...negotiated,
            'Content-Security-Policy': GUIDE_CSP,
            'X-Content-Type-Options': 'nosniff',
            Link: `${markdownLink}, ${LICENSE_LINK}, ${CARD_LINK}`,
          })
        : text(
            page.markdown,
            kind === 'markdown' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
            'private, max-age=300',
            { ...negotiated, Link: `<${html}>; rel="alternate"; type="text/html", ${LICENSE_LINK}, ${CARD_LINK}` },
          )
  }
  return new Response(request.method === 'HEAD' ? null : response.body, { headers: response.headers })
}