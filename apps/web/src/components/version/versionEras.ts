import { VERSION_ID_MAP, VERSION_SLUG_MAP, VersionEnum } from '@gekichumai/dxdata'

/**
 * Version lists are shown as two pages: the classic cabinets (maimai to FiNALE) and the でらっくす era. Within a page
 * every version sits next to its PLUS, the base on the left and the PLUS always on the right.
 */
export const VERSION_ERAS = ['dx', 'classic'] as const
export type VersionEra = (typeof VERSION_ERAS)[number]

const DX_ERA_FIRST_ID = VERSION_ID_MAP.get(VersionEnum.Maimaiでらっくす) ?? 13

export const versionEraOf = (version: VersionEnum): VersionEra =>
  (VERSION_ID_MAP.get(version) ?? Number.POSITIVE_INFINITY) >= DX_ERA_FIRST_ID ? 'dx' : 'classic'

const PLUS_SUFFIX = ' PLUS'

export const isPlusVersion = (version: VersionEnum) => version.endsWith(PLUS_SUFFIX)

/** A row of a version list. Either side is null when that version is missing (FiNALE and MAGiCAL have no PLUS). */
export type VersionPair = { key: string; base: VersionEnum | null; plus: VersionEnum | null }

const versionId = (version: VersionEnum) => VERSION_ID_MAP.get(version) ?? Number.POSITIVE_INFINITY

/**
 * Pairs each version with its PLUS. Rows run newest first, like every version list on the site; the input order does
 * not matter.
 */
export function pairVersions(versions: readonly VersionEnum[]): VersionPair[] {
  const pairs = new Map<string, VersionPair>()
  const sorted = [...new Set(versions)].sort((a, b) => versionId(a) - versionId(b))

  for (const version of sorted) {
    const plus = isPlusVersion(version)
    const key = plus ? version.slice(0, -PLUS_SUFFIX.length) : version
    const pair = pairs.get(key) ?? { key, base: null, plus: null }
    if (plus) pair.plus = version
    else pair.base = version
    pairs.set(key, pair)
  }

  return [...pairs.values()].reverse()
}

/** The versions of one page, paired */
export const pairVersionsByEra = (versions: readonly VersionEnum[], era: VersionEra) =>
  pairVersions(versions.filter((version) => versionEraOf(version) === era))

// Served from our own origin while the asset host has no title image for the version yet
const LOCAL_VERSION_LOGOS: Partial<Record<VersionEnum, string>> = {
  [VersionEnum.MAGiCAL]: '/images/versions/magical/logo.webp',
}

/** Intrinsic size of the title images, so the tiles keep their size while they load */
export const VERSION_LOGO_SIZE = { width: 332, height: 160 } as const

/**
 * The official title logo of a でらっくす-era version, from our asset host. The classic cabinets have no title image
 * there, so they are drawn as text (null).
 */
export function versionLogoSrc(version: VersionEnum): string | null {
  const local = LOCAL_VERSION_LOGOS[version]
  if (local) return local
  if (versionEraOf(version) !== 'dx') return null
  const slug = VERSION_SLUG_MAP.get(version)
  return slug ? `https://shama.dxrating.net/images/version-title/${slug}.png` : null
}