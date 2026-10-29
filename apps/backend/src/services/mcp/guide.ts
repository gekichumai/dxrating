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
import { GUIDE_SCRIPT, GUIDE_STYLE } from './guide-assets'
import { ICONS, SITE_URL } from './output'

// The setup guide of the MCP server, at the root of its host (mcp.dxrating.net): how to add the server to Claude,
// ChatGPT, Cursor, VS Code and other apps, what its tools do, its data, limits and privacy. It is in the languages of
// the web app (guide-text.ts), as HTML for people and as Markdown for agents, with llms.txt and robots.txt for the
// host. Everything is rendered once, on the first request. The HTML page looks like dxrating.net: it loads nothing but
// the icon of the site and the Torus font, from the host of the assets, and its inline style and script
// (guide-assets.ts), which its Content-Security-Policy allows by their hashes. The script only enhances it: copy
// buttons, and the apps as tabs (without it, every app shows, one under the other).
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

/** Blocks as HTML; in a section of prompts (Try it), a list is of prompts to copy, and a paragraph led by a bold label
 * (**Check that it works:**) a callout */
function htmlBlocks(blocks: Block[], expand: (s: string) => string, copy: string, prompts = false): string {
  return blocks
    .map((block, i) => {
      if ('p' in block) {
        const p = expand(block.p)
        return prompts && /^\*\*[^*]+[:：]\*\*/.test(p)
          ? `<p class="callout">${inlineHtml(p)}</p>`
          : `<p>${inlineHtml(p)}</p>`
      }
      if ('items' in block) return itemsHtml(block.items.map(expand), copy, prompts)
      if ('steps' in block)
        return `<ol class="steps">${block.steps.map((s) => `<li>${inlineHtml(expand(s))}</li>`).join('')}</ol>`
      const before = blocks[i - 1]
      return codeHtml(block.code, before && 'p' in before ? before.p : '', copy)
    })
    .join('\n')
}

/**
 * A copy button, which the script shows: an icon, with its label for screen readers, or a button that says it. It has
 * both icons, copy and copied, which cross-fade.
 */
function copyButton(label: string, kind: 'icon' | 'text' | 'solid' | 'cta' = 'icon'): string {
  const cls = { icon: 'cp cp-ico', text: 'cp', solid: 'cp cp-solid', cta: 'cp cta' }[kind]
  const t = `<span class="t${kind === 'icon' ? ' sr' : ''}">${escapeHtml(label)}</span>`
  return `<button type="button" class="${cls}" hidden><span class="ic">${icon('copy')}${icon('check')}</span>${t}</button>`
}

/** A line of the texts as the text it is: what a copy button copies */
const plain = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

/**
 * A list as its items are: questions and their answers (every item starts with a bold question), prompts to copy (in
 * Try it), else a list
 */
function itemsHtml(items: string[], copy: string, prompts = false): string {
  const faq = items.map((item) => item.match(/^\*\*(.+?)[:：]?\*\*\s*(.*)$/s))
  if (faq.every((m) => m !== null)) {
    const rows = faq.map((m) => `<div><dt>${inlineHtml(m![1])}</dt><dd>${inlineHtml(m![2])}</dd></div>`)
    return `<dl class="faq panel">${rows.join('')}</dl>`
  }
  if (prompts) {
    const li = items.map((i) => `<li data-c="${escapeHtml(plain(i))}"><p>${inlineHtml(i)}</p>${copyButton(copy)}</li>`)
    return `<ul class="prompts">${li.join('')}</ul>`
  }
  return `<ul class="dash">${items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</ul>`
}

/** A line of code of lang, highlighted: keys (k), strings (s), punctuation (p), the command (c) and its flags (f) */
function highlight(lang: string, line: string): string {
  const span = (cls: string, s: string) => `<span class="${cls}">${escapeHtml(s)}</span>`
  if (lang === 'json') {
    return line.replace(
      /("(?:[^"\\]|\\.)*")(\s*:)?|([{}[\],:])|([^\s"{}[\],:]+)|(\s+)/g,
      (_, str?: string, colon?: string, punct?: string, word?: string, space?: string) => {
        if (str !== undefined) return colon ? span('k', str) + span('p', colon) : span('s', str)
        if (punct !== undefined) return span('p', punct)
        return escapeHtml(word ?? space ?? '')
      },
    )
  }
  if (lang === 'toml') {
    const section = line.match(/^\[(.+)\]$/)
    if (section) return span('p', '[') + span('k', section[1]) + span('p', ']')
    const pair = line.match(/^([\w.-]+)(\s*=\s*)(.*)$/)
    return pair ? span('k', pair[1]) + span('p', pair[2]) + span('s', pair[3]) : escapeHtml(line)
  }
  let first = true
  return line.replace(/('[^']*'|"[^"]*")|(\S+)|(\s+)/g, (_, quoted?: string, word?: string, space?: string) => {
    if (quoted !== undefined) return span('s', quoted)
    if (word === undefined) return space ?? ''
    if (first) {
      first = false
      return span('c', word)
    }
    return word.startsWith('-') ? span('f', word) : escapeHtml(word)
  })
}

/** The label of a block of code: the file it goes in, as the paragraph before it names it, else its language */
function codeLabel(lang: string, before: string): string {
  const file = [...before.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).find((f) => f.endsWith(`.${lang}`))
  return file ?? { sh: 'Terminal', json: 'JSON', toml: 'TOML' }[lang] ?? lang
}

/** A block of code: its label, a copy button, the code, each line a span that wraps under its indentation */
function codeHtml(name: string, before: string, copy: string): string {
  const { lang, code } = snippetBlock(name)
  const lines = code.split('\n').map((line) => {
    const spaces = line.length - line.trimStart().length
    return `<span class="ln i${Math.min(3, spaces >> 1)}">${' '.repeat(spaces)}${highlight(lang, line.trimStart())}</span>`
  })
  return (
    `<div class="code code-${lang}" data-c="${escapeHtml(code)}"><div class="code-h"><span class="code-l">` +
    `${escapeHtml(codeLabel(lang, before))}</span>${copyButton(copy, 'text')}</div>` +
    `<pre tabindex="0"><code class="language-${lang}">${lines.join('')}</code></pre></div>`
  )
}

/** src, CSS or JavaScript, without its comments and the indentation of its lines */
function minify(src: string, comment: RegExp): string {
  return src
    .replace(comment, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

export const GUIDE_STYLE_CSS = minify(GUIDE_STYLE, /\/\*[\s\S]*?\*\//g)
export const GUIDE_SCRIPT_JS = minify(GUIDE_SCRIPT, /^\s*\/\/.*$/gm)

/** The CSP source of an inline style or script */
const cspHash = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`
const ICON = ICONS[0].src
/** The host of the assets of dxrating.net: the icon, and the Torus font of the style */
const ASSETS = new URL(ICON).origin
const FONT = `${ASSETS}/fonts/Torus-Regular.woff2`

export const GUIDE_CSP =
  `default-src 'none'; style-src ${cspHash(GUIDE_STYLE_CSS)}; script-src ${cspHash(GUIDE_SCRIPT_JS)}; ` +
  `font-src ${ASSETS}; img-src ${ASSETS}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`

const SPRITE =
  '<svg class="sprite" aria-hidden="true">' +
  '<symbol id="i-copy" viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="2"/>' +
  '<path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></symbol>' +
  '<symbol id="i-check" viewBox="0 0 16 16"><path d="M3 8.5l3.2 3.2L13 4.8"/></symbol>' +
  '<symbol id="i-out" viewBox="0 0 16 16"><path d="M6 4h6v6M12 4l-8 8"/></symbol></svg>'
const icon = (id: string) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`

/** An app's name and the qualifier in its brackets: Claude (claude.ai, Claude Desktop, Claude mobile) */
function appName(id: AppId): { name: string; qualifier?: string } {
  const m = APP_NAMES[id].match(/^(.+?) \((.+)\)$/)
  return m ? { name: m[1], qualifier: m[2] } : { name: APP_NAMES[id] }
}

/** The first sentence of a paragraph, and the rest */
function firstSentence(s: string): [string, string] {
  const m = s.match(/^(.+?(?:\.(?=\s)|。))\s*(.*)$/s)
  return m ? [m[1], m[2]] : ['', s]
}

const unlabel = (s: string) => s.replace(/\s*[:：]\s*$/, '')

function renderHtml(text: GuideText): string {
  const expand = expander(text)
  const ui = text.ui
  const blocks = (b: Block[], prompts = false) => htmlBlocks(b, expand, ui.copy, prompts)
  const page = (t: GuideText) => `${MCP_GUIDE_URL}?lang=${t.lang}`
  const space = text.title.indexOf(' ')
  const [brand, rest] = [text.title.slice(0, space), text.title.slice(space + 1)]
  const h2 = (id: string, heading: string) => `<h2 id="${id}-h"><a href="#${id}">${escapeHtml(heading)}</a></h2>`
  const section = (s: Section, body = blocks(s.blocks), cls = 'sec') =>
    `<section class="${cls}" id="${s.id}" aria-labelledby="${s.id}-h">\n${h2(s.id, s.heading)}\n<div class="sec-b">${body}</div>\n</section>`
  const langs = GUIDE_TEXTS.map(
    (t) =>
      `<a href="?lang=${t.lang}" hreflang="${t.lang}" lang="${t.lang}"${t === text ? ' aria-current="page"' : ''}>` +
      `<span class="ln">${escapeHtml(t.name)}</span><span class="ln-s" aria-hidden="true">${escapeHtml(t.ui.abbr)}</span></a>`,
  ).join('')
  const img = (size: number, cls = '') =>
    `<img${cls ? ` class="${cls}"` : ''} src="${escapeHtml(ICON)}" alt="" width="${size}" height="${size}">`
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="theme-color" content="#127a63" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0f2a24" media="(prefers-color-scheme: dark)">',
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
    `<link rel="preload" href="${FONT}" as="font" type="font/woff2" crossorigin>`,
    `<style>${GUIDE_STYLE_CSS}</style>`,
  ]
  const tab = (id: string, name: string) => `<a class="tab" href="#${id}">${escapeHtml(name)}</a>`
  const group = (label: string, tabs: string[]) =>
    `<div class="grp"><span class="grp-l">${escapeHtml(label)}</span><div class="seg">${tabs.join('')}</div></div>`
  const panel = (id: string, name: string, body: string, qualifier?: string) =>
    `<section class="app-p" id="${id}" aria-labelledby="${id}-h"><h3 id="${id}-h">${escapeHtml(name)}` +
    `${qualifier ? ` <span class="q">${escapeHtml(qualifier)}</span>` : ''}</h3>\n${body}</section>`
  const app = (id: AppId) => {
    const { name, qualifier } = appName(id)
    const docs = APP_DOCS[id]
    const link =
      `<p class="docs"><span>${escapeHtml(unlabel(text.docs))}</span> <a href="${escapeHtml(docs)}">` +
      `<span>${escapeHtml(docs.replace(/^https:\/\//, ''))}</span>${icon('out')}</a></p>`
    return panel(id, name, `${blocks(text.apps[id])}\n${link}`, qualifier)
  }
  const oneClick = Object.values(ONE_CLICK).map(
    (a) =>
      `<a class="pill-btn" href="${escapeHtml(a.link(MCP_PUBLIC_URL))}">${escapeHtml(text.addTo.replace('%s', a.name))}${icon('out')}</a>`,
  )
  const [l1, lrest] = firstSentence(expand(text.lead[0]))
  const prompt = expand(text.agentPrompt)
  const tools = GUIDE_TOOLS.map(
    (name) => `<li class="panel"><h3><code>${name}</code></h3><p>${inlineHtml(expand(text.tools[name]))}</p></li>`,
  )
  const facts = text.facts.map(
    ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${inlineHtml(expand(value))}</dd></div>`,
  )
  const body = [
    SPRITE,
    `<a class="skip" href="#main">${escapeHtml(ui.skip)}</a>`,
    '<header class="bar"><div class="in">',
    `<div class="mark"><a class="home" href="${SITE_URL}/" aria-label="${escapeHtml(ui.home)}">${img(30)}` +
      `<span>${escapeHtml(brand)}</span></a><span class="chip">MCP</span></div>`,
    `<nav class="jump" aria-label="${escapeHtml(ui.pageNav)}"><a href="#install">${escapeHtml(text.installHeading)}</a>` +
      `<a href="#tools">${escapeHtml(text.toolsHeading)}</a>` +
      `<a href="#troubleshooting">${escapeHtml(text.troubleshooting.heading)}</a></nav>`,
    `<div class="bar-r"><a class="md" href="${escapeHtml(expand('{md}'))}" type="text/markdown">${escapeHtml(ui.markdown)}</a>` +
      `<nav class="langs" aria-label="${escapeHtml(ui.langNav)}">${langs}</nav></div>`,
    '</div></header>',
    '<main id="main" class="in">',
    '<section class="hero" aria-labelledby="title">',
    img(76, 'app'),
    `<h1 id="title">${escapeHtml(brand)} <span class="h1-b">${escapeHtml(rest)}</span></h1>`,
    `<p class="lead">${l1 ? `<span class="l1">${inlineHtml(l1)}</span>` : ''}${inlineHtml(lrest)}</p>`,
    ...text.lead.slice(1).map((p) => `<p class="aside">${inlineHtml(expand(p))}</p>`),
    `<ul class="badges">${text.badges
      .split(' · ')
      .map((b) => `<li>${icon('check')}${escapeHtml(b)}</li>`)
      .join('')}</ul>`,
    '</section>',
    '<div class="connect">',
    '<section class="panel" aria-labelledby="url">',
    `<h2 class="kicker" id="url">${escapeHtml(text.urlLabel)}</h2>`,
    `<div class="field" data-c="${MCP_PUBLIC_URL}"><code>${MCP_PUBLIC_URL}</code>${copyButton(ui.copy, 'solid')}</div>`,
    `<dl class="facts">${facts.join('')}</dl>`,
    `<p class="note">${inlineHtml(expand(text.urlNote))}</p>`,
    `<div class="oc"><h3 class="kicker">${escapeHtml(unlabel(text.oneClick))}</h3>`,
    `<div class="oc-g">${oneClick.join('')}</div>`,
    `<p class="note">${inlineHtml(expand(text.oneClickNote))}</p></div>`,
    '</section>',
    `<section class="panel agent" id="agent" aria-labelledby="agent-h" data-c="${escapeHtml(prompt)}">`,
    `<h2 id="agent-h">${escapeHtml(text.agentHeading)}</h2>`,
    `<p class="note">${inlineHtml(expand(text.agentIntro))}</p>`,
    `<pre class="prompt"><code>${escapeHtml(prompt)}</code></pre>`,
    copyButton(ui.copyPrompt, 'cta'),
    '</section>',
    '</div>',
    `<section class="sec" id="install" aria-labelledby="install-h">`,
    h2('install', text.installHeading),
    `<nav class="clients" aria-label="${escapeHtml(ui.appNav)}" data-tabs>`,
    group(
      text.chatApps,
      CHAT_APPS.map((id) => tab(id, appName(id).name)),
    ),
    group(text.codingTools, [
      ...CODING_TOOLS.map((id) => tab(id, appName(id).name)),
      tab(text.other.id, text.other.heading),
    ]),
    '</nav>',
    '<div class="apps panel">',
    ...CHAT_APPS.map(app),
    ...CODING_TOOLS.map(app),
    panel(text.other.id, text.other.heading, blocks(text.other.blocks)),
    '</div>',
    '</section>',
    section(text.tryIt, blocks(text.tryIt.blocks, true)),
    section(
      { id: 'tools', heading: text.toolsHeading, blocks: [] },
      `<p>${inlineHtml(expand(text.toolsIntro))}</p><ul class="tools">${tools.join('')}</ul>`,
    ),
    '<div class="trio">',
    section(text.data, undefined, 'sec panel'),
    section(text.limits, undefined, 'sec panel'),
    section(text.privacy, undefined, 'sec panel'),
    '</div>',
    section(text.troubleshooting),
    section(text.links),
    '</main>',
    '<footer class="foot"><div class="in">',
    `<div><p class="foot-b">${img(22)}${escapeHtml(brand)} <span class="chip">MCP</span></p><p>${inlineHtml(expand(text.footer))}</p></div>`,
    `<p class="foot-l">${langs}</p>`,
    '</div></footer>',
    '<div id="live" class="sr" aria-live="polite"></div>',
    `<script>${GUIDE_SCRIPT_JS}</script>`,
  ]
  return (
    `<!doctype html>\n<html lang="${text.lang}" data-copied="${escapeHtml(ui.copied)}">\n` +
    `<head>\n${head.join('\n')}\n</head>\n<body>\n${body.join('\n')}\n</body>\n</html>\n`
  )
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