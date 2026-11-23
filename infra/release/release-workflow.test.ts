import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, test } from 'node:test'

import { load } from 'js-yaml'

interface Step {
  run?: string
  uses?: string
}
interface Job {
  needs?: string | string[]
  if?: string
  concurrency?: unknown
  steps: Step[]
}
interface Workflow {
  concurrency?: { group?: string } | string
  jobs: Record<string, Job>
}

const root = resolve(import.meta.dirname, '../..')
const workflow = load(readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')) as Workflow

const deployJobs = Object.entries(workflow.jobs).filter(([, job]) =>
  job.steps.some(
    (step) =>
      /wrangler\s+(?:versions\s+)?(?:deploy|rollback)/.test(step.run ?? '') ||
      step.uses?.startsWith('cloudflare/wrangler-action'),
  ),
)

function gateOf(id: string, job: Job): { gateId: string; output: string } {
  const match = /^(?:\$\{\{\s*)?needs\.([\w-]+)\.outputs\.([\w-]+) == 'true'(?:\s*\}\})?$/.exec(job.if?.trim() ?? '')
  const needs = [job.needs ?? []].flat()
  assert.ok(
    match && needs.includes(match[1]),
    `release.yml: job "${id}" runs wrangler deploy without the newest-tag check, so an older tag can deploy over a newer one (#374, v1.6.522). Give it \`needs: <check>\` and \`if: needs.<check>.outputs.newest == 'true'\`, where <check> runs infra/release/newest-tag.ts.`,
  )
  return { gateId: match[1], output: match[2] }
}

const fixture = mkdtempSync(join(tmpdir(), 'release-workflow-'))
after(() => rmSync(fixture, { recursive: true, force: true }))

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.name=ci', '-c', 'user.email=ci@example.com', '-c', 'tag.gpgSign=false', ...args], {
    cwd,
    stdio: 'pipe',
  })
}

function originWithTags(tags: string[]): string {
  const origin = mkdtempSync(join(fixture, 'origin-'))
  const work = mkdtempSync(join(fixture, 'work-'))
  git(origin, 'init', '--bare', '--quiet')
  git(work, 'init', '--quiet')
  git(work, 'commit', '--allow-empty', '--no-gpg-sign', '--quiet', '-m', 'release')
  for (const tag of tags) git(work, 'tag', tag)
  git(work, 'push', '--quiet', '--tags', origin)
  return origin
}

function checkoutLikeActions(origin: string, tag: string): string {
  const checkout = mkdtempSync(join(fixture, `checkout-${tag}-`))
  git(checkout, 'init', '--quiet')
  git(checkout, 'remote', 'add', 'origin', origin)
  git(checkout, 'fetch', '--quiet', '--no-tags', '--depth=1', 'origin', `+refs/tags/${tag}:refs/tags/${tag}`)
  git(checkout, 'checkout', '--quiet', tag)
  cpSync(join(root, 'infra/release'), join(checkout, 'infra/release'), { recursive: true })
  return checkout
}

function deploys(checkout: string, jobId: string, job: Job, tag: string): boolean {
  const { gateId, output } = gateOf(jobId, job)
  const outputFile = join(checkout, '.github-output')
  writeFileSync(outputFile, '')
  for (const step of workflow.jobs[gateId].steps) {
    if (!step.run) continue
    assert.ok(!step.run.includes('${{'), `release.yml: read values in job "${gateId}" from env vars, not \${{ }}`)
    try {
      execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run], {
        cwd: checkout,
        env: { ...process.env, GITHUB_REF: `refs/tags/${tag}`, GITHUB_REF_NAME: tag, GITHUB_OUTPUT: outputFile },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      return false
    }
  }
  const outputs = new Map(
    readFileSync(outputFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=') as [string, string]),
  )
  return outputs.get(output) === 'true'
}

test('release.yml deploys to production', () => {
  assert.ok(deployJobs.length > 0, 'release.yml: no job runs wrangler deploy; update this test if the deploy moved')
})

test('every release run waits on one lock for every tag', () => {
  const group = typeof workflow.concurrency === 'string' ? workflow.concurrency : workflow.concurrency?.group
  assert.ok(
    group && !group.includes('${{'),
    'release.yml: give the workflow one fixed concurrency group, so every tag waits on one lock for every tag and the newest-tag check sees the tags that ran before it (a per-tag group let v1.6.521-523 deploy in parallel, #374)',
  )
  for (const [id, job] of Object.entries(workflow.jobs)) {
    assert.equal(job.concurrency, undefined, `release.yml: job "${id}" must use the workflow's lock, not its own`)
  }
})

test('a run for an older tag never deploys over a newer one (#374: v1.6.522 after v1.6.523)', () => {
  const origin = originWithTags(['v1.6.521', 'v1.6.522', 'v1.6.523'])
  for (const [id, job] of deployJobs) {
    assert.equal(
      deploys(checkoutLikeActions(origin, 'v1.6.522'), id, job, 'v1.6.522'),
      false,
      `release.yml: job "${id}" deploys v1.6.522 over v1.6.523`,
    )
    assert.equal(
      deploys(checkoutLikeActions(origin, 'v1.6.523'), id, job, 'v1.6.523'),
      true,
      `release.yml: job "${id}" skips v1.6.523, the newest tag`,
    )
  }
})

test('the deploy is skipped when the newest-tag check cannot reach origin', () => {
  const checkout = checkoutLikeActions(originWithTags(['v1.6.523']), 'v1.6.523')
  git(checkout, 'remote', 'set-url', 'origin', join(fixture, 'missing.git'))
  for (const [id, job] of deployJobs) {
    assert.equal(
      deploys(checkout, id, job, 'v1.6.523'),
      false,
      `release.yml: job "${id}" deploys when the newest-tag check fails; the check must fail closed`,
    )
  }
})