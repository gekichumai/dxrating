import { Context, Effect, Layer, Option, SynchronizedRef, type Scope } from 'effect'
import { HttpClient } from './services/http-client.js'

const GHCR_IMAGE = 'gekichumai/dxrating/backend'
const GITHUB_REPO = 'gekichumai/dxrating'

interface BuildInfo {
  commit: string
  imageDigest: string | null
  buildUrl: string
  repoUrl: string
  builtAt: string
  version: string
  attestation: { sigstoreBundle: unknown; verifyCommand: string } | null
}

export class BuildInformation extends Context.Tag('dxrating/BuildInformation')<
  BuildInformation,
  {
    readonly get: Effect.Effect<BuildInfo, never, Scope.Scope>
  }
>() {}

export const BuildInformationLive = Layer.effect(
  BuildInformation,
  Effect.gen(function* () {
    const http = yield* HttpClient
    const cache = yield* SynchronizedRef.make(Option.none<BuildInfo>())
    const load = Effect.gen(function* () {
      const commit = process.env.GIT_COMMIT ?? 'unknown'
      const info: BuildInfo = {
        commit,
        imageDigest: null,
        buildUrl: process.env.BUILD_URL ?? 'unknown',
        repoUrl: process.env.REPO_URL ?? 'unknown',
        builtAt: process.env.BUILT_AT ?? 'unknown',
        version: process.env.VERSION ?? 'unknown',
        attestation: null,
      }
      if (process.env.NODE_ENV !== 'production' || commit === 'unknown') return info
      const provenance = Effect.gen(function* () {
        const tokenResponse = yield* http.request(`https://ghcr.io/token?scope=repository:${GHCR_IMAGE}:pull`)
        if (!tokenResponse.ok) {
          yield* http.text(tokenResponse)
          return
        }
        const { token } = yield* http.json<{ token: string }>(tokenResponse)
        const manifest = yield* http.request(
          `https://ghcr.io/v2/${GHCR_IMAGE}/manifests/sha-${commit.substring(0, 7)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: [
                'application/vnd.oci.image.index.v1+json',
                'application/vnd.docker.distribution.manifest.list.v2+json',
                'application/vnd.docker.distribution.manifest.v2+json',
                'application/vnd.oci.image.manifest.v1+json',
              ].join(', '),
            },
          },
        )
        yield* http.text(manifest)
        if (!manifest.ok) return
        const imageDigest = manifest.headers.get('docker-content-digest')
        if (!imageDigest) return
        info.imageDigest = imageDigest
        const response = yield* http.request(
          `https://api.github.com/repos/${GITHUB_REPO}/attestations/${imageDigest}`,
          {
            headers: { Accept: 'application/json' },
          },
        )
        if (!response.ok) {
          yield* http.text(response)
          return
        }
        const data = yield* http.json<{ attestations?: { bundle: unknown }[] }>(response)
        const bundle = data.attestations?.[0]?.bundle
        if (bundle)
          info.attestation = {
            sigstoreBundle: bundle,
            verifyCommand: `gh attestation verify oci://ghcr.io/${GHCR_IMAGE}@${imageDigest} --repo ${GITHUB_REPO}`,
          }
      })
      // Optional provenance must not prevent a version response during an upstream outage.
      yield* provenance.pipe(
        Effect.timeout('10 seconds'),
        Effect.catchAll(() => Effect.void),
      )
      return info
    })
    // Cache only successful values. An interrupted first request must not poison
    // the endpoint or propagate its interruption to concurrent callers.
    const get = SynchronizedRef.modifyEffect(cache, (current) =>
      Option.isSome(current)
        ? Effect.succeed([current.value, current] as const)
        : load.pipe(Effect.map((info) => [info, Option.some(info)] as const)),
    )
    return { get }
  }),
)

export const getBuildInfo = Effect.flatMap(BuildInformation, (service) => service.get)