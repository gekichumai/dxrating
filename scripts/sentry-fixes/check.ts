import { execFileSync } from 'node:child_process'

// Sentry's resolve-via-commit parser, ported from getsentry/sentry src/sentry/utils/groupreference.py.
const fixKeyword = String.raw`\b(?:Fix|Fixes|Fixed|Close|Closes|Closed|Resolve|Resolves|Resolved):?\s+`
const markdownLink = /\[([^\]]+)\]\([^)]+\)/g
const fixesRun = new RegExp(String.raw`${fixKeyword}([A-Za-z0-9_\-\s,]+)\b`, 'gid')
const shortIdCandidate = /\b[A-Z0-9_-]+-[A-Z0-9]+\b/gi
const fixesUrl = new RegExp(String.raw`${fixKeyword}(https?://\S+)`, 'gid')
const sentryIssueUrl = /^https?:\/\/([^/]+\.)?sentry\.io\/(.*\/)?issues\/\d+/i

const fixesLine = /^ {0,3}Fixes ([A-Z0-9_-]+-[A-Z0-9]+)\s*$/
const quotedMarkdown = /^ {0,3}(`{3,}|~{3,})[\s\S]*?(?:^ {0,3}\1|(?![\s\S]))|<!--[\s\S]*?(?:-->|(?![\s\S]))/gm

const howToFix =
  'Sentry resolves every issue that follows Fix, Fixes, Closes or Resolves anywhere in a PR title, PR body or commit message, ' +
  'even when the sentence says it does not fix it or the ID is in backticks. ' +
  'Write each issue this change fixes on a line of its own, outside code blocks and comments, that reads exactly `Fixes <SHORT-ID>`, ' +
  'and mention any other issue without those words (e.g. "Investigates DXRATING-BACKEND-2J").'

interface StrayFix {
  issue: string
  line: string
}

// Every project in the gekichumai Sentry org is named dxrating-*.
const ourShortId = /^DXRATING-/i

export function strayFixes(text: string): StrayFix[] {
  const plain = text.replace(markdownLink, '$1')
  const lineAt = (index: number) => {
    const start = plain.lastIndexOf('\n', index - 1) + 1
    const end = plain.indexOf('\n', index)
    return plain.slice(start, end === -1 ? undefined : end).trim()
  }
  const declared = new Set(
    plain
      .replace(quotedMarkdown, '')
      .split('\n')
      .flatMap((line) => {
        const match = fixesLine.exec(line)
        return match ? [match[1]] : []
      }),
  )

  const strays: StrayFix[] = []
  for (const run of plain.matchAll(fixesRun)) {
    const runStart = run.indices![1]![0]
    for (const candidate of run[1].matchAll(shortIdCandidate)) {
      const issue = candidate[0]
      if (ourShortId.test(issue) && !declared.has(issue.toUpperCase())) {
        strays.push({ issue, line: lineAt(runStart + candidate.index) })
      }
    }
  }
  for (const url of plain.matchAll(fixesUrl)) {
    if (sentryIssueUrl.test(url[1])) {
      strays.push({ issue: url[1], line: lineAt(url.indices![1]![0]) })
    }
  }
  return strays
}

function commitMessages(range: string) {
  return execFileSync('git', ['log', '--format=%h%x00%B%x01', range], { encoding: 'utf8' })
    .split('\x01')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, message] = entry.split('\x00')
      return { source: `commit ${sha}`, text: message }
    })
}

if (import.meta.main) {
  const range = process.argv[2]
  const texts = [
    { source: 'PR title', text: process.env.PR_TITLE ?? '' },
    { source: 'PR body', text: process.env.PR_BODY ?? '' },
    ...(range ? commitMessages(range) : []),
  ]
  const problems = texts.flatMap(({ source, text }) =>
    strayFixes(text).map(({ issue, line }) => `${source}: resolves ${issue} through "${line}"`),
  )
  if (problems.length > 0) {
    console.error(`${problems.join('\n')}\n\n${howToFix}`)
    process.exit(1)
  }
  console.log(`No stray Sentry fix references in ${texts.length} text(s).`)
}