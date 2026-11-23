import { execFileSync } from 'node:child_process'

type Version = readonly [major: number, minor: number, patch: number]

function parseVersion(tag: string): Version | undefined {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

export function newestReleaseTag(tags: readonly string[]): string | undefined {
  let newest: { tag: string; version: Version } | undefined
  for (const tag of tags) {
    const version = parseVersion(tag)
    if (version && (!newest || compareVersions(version, newest.version) > 0)) newest = { tag, version }
  }
  return newest?.tag
}

function remoteTags(): string[] {
  const output = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin'], { encoding: 'utf8' })
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1].replace('refs/tags/', ''))
}

if (import.meta.main) {
  const tag = process.argv[2] ?? ''
  if (!parseVersion(tag)) throw new Error(`"${tag}" is not a release tag (vMAJOR.MINOR.PATCH)`)
  const newest = newestReleaseTag([tag, ...remoteTags()])
  if (newest === tag) {
    console.log('newest=true')
  } else {
    console.log('newest=false')
    console.error(`::notice::Not deploying ${tag}: ${newest} is newer, and production never goes back a release.`)
  }
}