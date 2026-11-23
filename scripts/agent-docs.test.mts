import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')

const PATH_SHAPE = /^[\w.-]+(?:\/[\w.-]+)*\/?$/
const FILE_EXTENSION = /\.[a-z]{1,5}$/i

const isIgnored = (path: string) =>
  spawnSync('git', ['check-ignore', '-q', '--no-index', '--', path], { cwd: root }).status === 0

function missingPaths(markdown: string, docDir: string): { line: number; path: string }[] {
  const bases = [docDir, root]
  const topLevel = new Set(bases.flatMap((base) => readdirSync(base)))
  const missing: { line: number; path: string }[] = []
  let fenced = false
  for (const [index, text] of markdown.split('\n').entries()) {
    if (/^\s*(```|~~~)/.test(text)) fenced = !fenced
    if (fenced) continue
    for (const [, span] of text.matchAll(/`([^`]+)`/g)) {
      if (!span.includes('/') || !PATH_SHAPE.test(span)) continue
      const named = topLevel.has(span.split('/')[0]) || span.endsWith('/') || FILE_EXTENSION.test(span)
      if (!named) continue
      const found = bases.some((base) => existsSync(join(base, span)) || isIgnored(relative(root, join(base, span))))
      if (!found) missing.push({ line: index + 1, path: span })
    }
  }
  return missing
}

test('a missing path is reported, while package specifiers, URL paths and code blocks are not', () => {
  const doc = [
    'See `apps/backend/src/app.ts`, `apps/functions/` and `src/gone.ts`.',
    'Import `hono/cors`, `@orpc/server` and `effect/unstable/sql/SqlError`; call `/api/v1/tags`.',
    'Local settings go in `apps/backend/.env.local`.',
    '```bash',
    'cd apps/backend && pnpm vitest run src/test/missing.test.ts `apps/also-missing/`',
    '```',
  ].join('\n')
  assert.deepEqual(missingPaths(doc, root), [
    { line: 1, path: 'apps/functions/' },
    { line: 1, path: 'src/gone.ts' },
  ])
})

test('every repo path named in AGENTS.md and CLAUDE.md exists', () => {
  const docs = execFileSync('git', ['ls-files', '-z', '--', ':(glob)**/AGENTS.md', ':(glob)**/CLAUDE.md'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
  const files = [...new Set(docs.map((doc) => realpathSync(join(root, doc))))]
  assert.ok(files.length > 0, 'no AGENTS.md or CLAUDE.md found')
  const problems = files.flatMap((file) =>
    missingPaths(readFileSync(file, 'utf8'), dirname(file)).map(
      ({ line, path }) => `${relative(root, file)}:${line} names \`${path}\`, which is not in the repo`,
    ),
  )
  assert.equal(
    problems.length,
    0,
    `${problems.join('\n')}\nFix the path (from the doc's directory or the repo root), or delete the sentence if what it describes is gone.`,
  )
})