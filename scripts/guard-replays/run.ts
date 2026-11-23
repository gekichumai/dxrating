import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

interface Replay {
  mistake: string
  history: string[]
  guard: string
  check: string
  expect: string
  needs?: string[]
}

const root = resolve(import.meta.dirname, '../..')
const replaysDir = join(import.meta.dirname, 'replays')

const { values } = parseArgs({
  options: {
    only: { type: 'string', multiple: true },
    needs: { type: 'string', multiple: true, default: [] },
  },
})
const given = new Set(values.needs ?? [])

// Under GITHUB_ACTIONS, oxlint switches to one-line annotations and drops the
// help text that an `expect` names, so checks run with the local output format.
const { GITHUB_ACTIONS: _annotations, ...env } = process.env

function sh(command: string, args: string[], timeoutMs = 600_000) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, shell: false, env })
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

function loadReplay(id: string): Replay {
  const replay = JSON.parse(readFileSync(join(replaysDir, id, 'replay.json'), 'utf8')) as Replay
  for (const key of ['mistake', 'guard', 'check', 'expect'] as const) {
    if (typeof replay[key] !== 'string' || replay[key].length === 0) {
      throw new Error(`${id}/replay.json: "${key}" must be a non-empty string`)
    }
  }
  if (!Array.isArray(replay.history) || replay.history.length === 0) {
    throw new Error(`${id}/replay.json: "history" must name the PR or commit that made this mistake`)
  }
  return replay
}

function touchedPaths(patchPath: string): string[] {
  const { status, output } = sh('git', ['apply', '--numstat', patchPath])
  if (status !== 0) return []
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[2])
}

const ids = readdirSync(replaysDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((id) => !values.only || values.only.includes(id))
  .sort()

if (values.only && ids.length !== values.only.length) {
  console.error(`Unknown replay: ${values.only.filter((id) => !ids.includes(id)).join(', ')}`)
  process.exit(1)
}

const failures: string[] = []
let ran = 0
for (const id of ids) {
  const replay = loadReplay(id)
  const needs = replay.needs ?? []
  if (needs.length > 0 !== given.size > 0 || needs.some((need) => !given.has(need))) {
    console.log(`- ${id}: skipped here, needs ${needs.join(', ') || 'nothing'}`)
    continue
  }
  const patchPath = join(replaysDir, id, 'replay.patch')
  if (!existsSync(patchPath)) {
    failures.push(`${id}: replay.patch is missing`)
    continue
  }
  const dirty = touchedPaths(patchPath).filter((path) => sh('git', ['status', '--porcelain', '--', path]).output.trim())
  if (dirty.length > 0) {
    failures.push(`${id}: refusing to patch files with local changes: ${dirty.join(', ')}`)
    continue
  }
  const applies = sh('git', ['apply', '--check', patchPath])
  if (applies.status !== 0) {
    failures.push(
      `${id}: replay.patch no longer applies. Reintroduce the mistake (${replay.history.join(', ')}) in today's code and regenerate it with \`git diff --no-ext-diff > ${relative(root, patchPath)}\`.\n${applies.output}`,
    )
    continue
  }
  ran++
  sh('git', ['apply', patchPath])
  let result: { status: number | null; output: string }
  try {
    result = sh('sh', ['-c', replay.check])
  } finally {
    const reverted = sh('git', ['apply', '-R', patchPath])
    if (reverted.status !== 0) {
      console.error(`${id}: could not revert replay.patch; restore the files by hand.\n${reverted.output}`)
      process.exit(2)
    }
  }
  if (result.status === 0) {
    failures.push(
      `${id}: the guard let the mistake through. \`${replay.check}\` passed with ${replay.history.join(', ')} reintroduced.`,
    )
  } else if (!result.output.includes(replay.expect)) {
    failures.push(
      `${id}: \`${replay.check}\` failed, but not with "${replay.expect}". It may be failing for an unrelated reason.\n${result.output.slice(-4000)}`,
    )
  } else {
    console.log(`✓ ${id}: ${replay.guard} catches ${replay.history.join(', ')}`)
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} guard replay(s) failed:\n\n${failures.join('\n\n')}`)
  process.exit(1)
}
console.log(`\n${ran} guard replay(s) caught their mistake.`)