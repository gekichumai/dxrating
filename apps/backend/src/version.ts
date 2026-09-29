import { Context, Effect, Layer, Option, SynchronizedRef, type Scope } from 'effect'
import { HttpClient } from './services/http-client'

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

export class BuildInformation extends Context.Service<
  BuildInformation,
  {
    readonly get: Effect.Effect<BuildInfo, never, Scope.Scope>
  }
>()('dxrating/BuildInformation') {}

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
        const tokenResponse = yield* http.get(`https://ghcr.io/token?scope=repository:${GHCR_IMAGE}:pull`)
        if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
          yield* tokenResponse.text
          return
        }
        const { token } = (yield* tokenResponse.json) as { token: string }
        const manifest = yield* http.get(`https://ghcr.io/v2/${GHCR_IMAGE}/manifests/sha-${commit.substring(0, 7)}`, {
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
        yield* manifest.text
        if (manifest.status < 200 || manifest.status >= 300) return
        const imageDigest = manifest.headers['docker-content-digest']
        if (!imageDigest) return
        info.imageDigest = imageDigest
        const response = yield* http.get(`https://api.github.com/repos/${GITHUB_REPO}/attestations/${imageDigest}`, {
          headers: { Accept: 'application/json' },
        })
        if (response.status < 200 || response.status >= 300) {
          yield* response.text
          return
        }
        const data = (yield* response.json) as { attestations?: { bundle: unknown }[] }
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
        Effect.catch(() => Effect.void),
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