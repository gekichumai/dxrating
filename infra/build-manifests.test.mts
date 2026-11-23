import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

interface Manifest {
  name: string
  main?: string
  exports?: string | Record<string, string | { default?: string }>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  engines?: { node?: string }
  packageManager?: string
}

interface Stage {
  name: string
  lines: string[]
}

const root = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const readManifest = (dir: string): Manifest => JSON.parse(read(join(dir, 'package.json')))

const repoFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)

const workspaceDirs = [...read('pnpm-workspace.yaml').matchAll(/^\s+- '?([\w-]+)\/\*'?$/gm)].flatMap(([, parent]) =>
  readdirSync(join(root, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, parent, entry.name, 'package.json')))
    .map((entry) => `${parent}/${entry.name}`),
)
const dirByName = new Map(workspaceDirs.map((dir) => [readManifest(dir).name, dir]))

function workspaceDeps(dir: string, withDev: boolean): Set<string> {
  const found = new Set<string>()
  const visit = (from: string) => {
    const { dependencies = {}, devDependencies = {} } = readManifest(from)
    for (const [name, spec] of Object.entries({ ...dependencies, ...(withDev ? devDependencies : {}) })) {
      const dep = dirByName.get(name)
      if (!spec.startsWith('workspace:') || !dep || found.has(dep)) continue
      found.add(dep)
      visit(dep)
    }
  }
  visit(dir)
  return found
}

function stagesOf(dockerfile: string): Stage[] {
  return read(dockerfile)
    .split(/^(?=FROM )/m)
    .filter((chunk) => chunk.startsWith('FROM '))
    .map((chunk) => {
      const lines = chunk.split('\n')
      return { name: lines[0].match(/ AS (\S+)/i)?.[1] ?? lines[0], lines }
    })
}

function copiedSources(stage: Stage): string[] {
  return stage.lines
    .filter((line) => line.startsWith('COPY ') && !line.includes('--from='))
    .flatMap((line) => line.split(/\s+/).slice(1, -1))
}

const isUnder = (dir: string, parents: string[]) =>
  parents.some((parent) => dir === parent || dir.startsWith(`${parent}/`))

const appImages = workspaceDirs
  .filter((dir) => existsSync(join(root, dir, 'Dockerfile')))
  .map((dir) => ({ dir, dockerfile: `${dir}/Dockerfile` }))

const installingStages = appImages.flatMap(({ dir, dockerfile }) =>
  stagesOf(dockerfile).flatMap((stage) => {
    const install = stage.lines.find((line) => /\bpnpm install\b/.test(line))
    if (!install) return []
    const prod = install.includes('--prod')
    const needs = new Set([dir, ...workspaceDeps('.', true), ...workspaceDeps(dir, !prod)])
    return [{ dockerfile, stage, prod, needs }]
  }),
)

test('every app image stage copies the package.json of exactly the workspace packages its pnpm install needs', () => {
  assert.ok(installingStages.length > 0)
  for (const { dockerfile, stage, needs } of installingStages) {
    const copied = new Set(
      copiedSources(stage)
        .filter((source) => source.endsWith('/package.json'))
        .map((source) => dirname(source)),
    )
    assert.deepEqual(
      {
        missing: [...needs].filter((dir) => !copied.has(dir)).sort(),
        extra: [...copied].filter((dir) => !needs.has(dir)).sort(),
      },
      { missing: [], extra: [] },
      `${dockerfile} (${stage.name}): add a \`COPY <dir>/package.json ./<dir>/\` line for each missing workspace package and drop the extra ones`,
    )
  }
})

test('every app image build stage copies the source of each workspace package it builds with', () => {
  for (const { dockerfile, stage, prod, needs } of installingStages) {
    if (prod) continue
    const sources = copiedSources(stage)
    const missing = [...needs].filter((dir) => !isUnder(dir, sources)).sort()
    assert.deepEqual(missing, [], `${dockerfile} (${stage.name}): add a \`COPY <dir> ./<dir>\` line for each of these`)
  }
})

test('.dockerignore lets in every workspace package an app image copies', () => {
  const allowed = read('.dockerignore')
    .split('\n')
    .filter((line) => line.startsWith('!'))
    .map((line) => line.slice(1).replace(/\/$/, ''))
  const needed = new Set(installingStages.flatMap(({ needs }) => [...needs]))
  const missing = [...needed].filter((dir) => !isUnder(dir, allowed)).sort()
  assert.deepEqual(missing, [], '.dockerignore: add a `!<dir>/` line for each of these')
})

test('Node and pnpm pins follow .node-version and packageManager', () => {
  const node = read('.node-version').trim()
  const rootManifest = readManifest('.')
  const pnpm = rootManifest.packageManager?.match(/^pnpm@(\d+\.\d+\.\d+)/)?.[1]
  assert.ok(pnpm, 'package.json: packageManager must be pnpm@<x.y.z>')
  assert.equal(rootManifest.engines?.node, node, 'package.json: engines.node must equal .node-version')

  const versionFiles = repoFiles.filter((file) => ['.node-version', '.nvmrc'].includes(basename(file)))
  assert.deepEqual(versionFiles, ['.node-version'], 'Keep one Node version file, the root .node-version')

  for (const dockerfile of repoFiles.filter((file) => basename(file) === 'Dockerfile')) {
    const text = read(dockerfile)
    for (const [, tag] of text.matchAll(/^FROM node:(\S+)/gm)) {
      assert.match(tag, new RegExp(`^${node.replaceAll('.', '\\.')}([-@]|$)`), `${dockerfile}: use node:${node}`)
    }
    for (const [, version] of text.matchAll(/pnpm@(\S+)/g)) {
      assert.equal(version, pnpm, `${dockerfile}: install pnpm@${pnpm}`)
    }
    assert.doesNotMatch(
      text,
      /corepack/,
      `${dockerfile}: node images do not ship corepack; use npm install -g pnpm@${pnpm}`,
    )
  }

  for (const workflow of repoFiles.filter((file) => /^\.github\/workflows\/.*\.ya?ml$/.test(file))) {
    const text = read(workflow)
    assert.doesNotMatch(text, /^\s*node-version:/m, `${workflow}: use node-version-file: '.node-version'`)
    for (const [, file] of text.matchAll(/node-version-file:\s*['"]?([^'"\s]+)/g)) {
      assert.equal(file, '.node-version', `${workflow}: use node-version-file: '.node-version'`)
    }
  }
})

test('Node loads every workspace package an app image runs from source', () => {
  const runtimeDirs = new Set(appImages.flatMap(({ dir }) => [...workspaceDeps(dir, false)]))
  for (const dir of runtimeDirs) {
    const { main, exports } = readManifest(dir)
    const targets =
      exports === undefined
        ? [main]
        : typeof exports === 'string'
          ? [exports]
          : Object.entries(exports)
              .filter(([subpath]) => !subpath.includes('*'))
              .map(([, target]) => (typeof target === 'string' ? target : target.default))
    for (const target of targets.filter((file): file is string => file?.endsWith('.ts') ?? false)) {
      const url = pathToFileURL(join(root, dir, target)).href
      const { status, stderr } = spawnSync(process.execPath, ['--input-type=module', '-e', `await import('${url}')`], {
        encoding: 'utf8',
      })
      assert.equal(status, 0, `Node cannot load ${dir}/${target}:\n${stderr}`)
    }
  }
})