const GHCR_IMAGE = 'gekichumai/dxrating/backend'
const GITHUB_REPO = 'gekichumai/dxrating'

interface BuildInfo {
  commit: string
  imageDigest: string | null
  buildUrl: string
  repoUrl: string
  builtAt: string
  version: string
  attestation: {
    sigstoreBundle: unknown
    verifyCommand: string
  } | null
}

let cached: BuildInfo | null = null

export async function getBuildInfo(): Promise<BuildInfo> {
  if (cached) return cached

  const commit = process.env.GIT_COMMIT ?? 'unknown'
  const buildUrl = process.env.BUILD_URL ?? 'unknown'
  const repoUrl = process.env.REPO_URL ?? 'unknown'
  const builtAt = process.env.BUILT_AT ?? 'unknown'
  const version = process.env.VERSION ?? 'unknown'

  const info: BuildInfo = {
    commit,
    imageDigest: null,
    buildUrl,
    repoUrl,
    builtAt,
    version,
    attestation: null,
  }

  if (process.env.NODE_ENV === 'production' && commit !== 'unknown') {
    try {
      const imageDigest = await resolveImageDigest(commit)
      if (imageDigest) {
        info.imageDigest = imageDigest
        const bundle = await fetchAttestation(imageDigest)
        if (bundle) {
          info.attestation = {
            sigstoreBundle: bundle,
            verifyCommand: `gh attestation verify oci://ghcr.io/${GHCR_IMAGE}@${imageDigest} --repo ${GITHUB_REPO}`,
          }
        }
      }
    } catch {
      // Graceful degradation — attestation is optional
    }
  }

  cached = info
  return info
}

async function resolveImageDigest(commit: string): Promise<string | null> {
  const shortSha = commit.substring(0, 7)
  const tag = `sha-${shortSha}`
  const token = await getGhcrToken()
  if (!token) return null

  // Fetch the manifest — may be an OCI image index (when attestations are attached)
  // or a plain image manifest. Accept both formats.
  const manifestRes = await fetch(`https://ghcr.io/v2/${GHCR_IMAGE}/manifests/${tag}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: [
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
        'application/vnd.docker.distribution.manifest.v2+json',
        'application/vnd.oci.image.manifest.v1+json',
      ].join(', '),
    },
  })
  if (!manifestRes.ok) return null

  // The digest of the top-level manifest (index or image) is what attestations reference
  return manifestRes.headers.get('docker-content-digest')
}

async function getGhcrToken(): Promise<string | null> {
  const res = await fetch(`https://ghcr.io/token?scope=repository:${GHCR_IMAGE}:pull`)
  if (!res.ok) return null
  const { token } = (await res.json()) as { token: string }
  return token
}

async function fetchAttestation(imageDigest: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/attestations/${imageDigest}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return null

  const data = (await res.json()) as {
    attestations?: { bundle: unknown }[]
  }
  return data.attestations?.[0]?.bundle ?? null
}