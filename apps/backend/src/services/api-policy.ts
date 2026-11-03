import type { OpenAPI } from '@orpc/openapi'

// The stability policy of /api/v1, as the API reference states it, and the order of the reference. The full policy is
// on /developers, in every language of the site; this is its English summary for the spec and Scalar.

export const API_POLICY_URL = 'https://dxrating.net/developers#api-stability'
export const API_CHANGELOG_URL = 'https://github.com/gekichumai/dxrating/issues/427'
export const API_SUPPORT_URL = 'https://github.com/gekichumai/dxrating/issues'

export const API_INFO_DESCRIPTION = `The public API of [DXRating](https://dxrating.net): maimai DX songs, charts, internal levels, tags, aliases and arcades.

**Start with [\`GET /dxdata\`](#tag/dx-data)**: the whole song and chart catalog, tags and aliases included, in one cacheable document. Revalidate it with \`If-None-Match\`; most integrations need nothing else.

## Stability (v1 is stable)

- **Additive only.** Within v1 we only add: endpoints, optional parameters, response fields, enum values, songs, tags and aliases. Ignore fields and enum values you don't know. Correcting data (internal levels, titles, dates, server availability) is not a breaking change.
- **Breaking changes** (removing or renaming an endpoint, parameter or field, changing a type or meaning, requiring auth where none was needed) only come with a new version, or after a deprecation.
- **Deprecation:** at least 6 months' notice. Deprecated endpoints send \`Deprecation\` (RFC 9745) and \`Sunset\` (RFC 8594) headers, and each deprecation is announced in the [changelog](${API_CHANGELOG_URL}).
- **v2**, if it ever comes, lives at \`/api/v2\`; v1 keeps working for at least 12 months after v2 is stable.
- **IDs are permanent.** Song IDs (\`dsng_…\`) and sheet IDs (\`dsht_…\`) are never reused. Songs and charts removed from the game stay in the catalog with an empty \`serverIds\` list. Merges and splits keep one existing ID and are announced in the changelog.
- **Scope:** DX Data, Tags, Aliases and Arcades (no sign-in needed). Analytics and chart images are best-effort. Endpoints that need a DXRating account (comments, tag attaching, alias submission, score import) exist for DXRating's own apps and can change at any time.

## Limits and caching

No API key. REST has no hard rate limit today: cache responses and revalidate with \`If-None-Match\` (\`/dxdata\`, \`/tags\`, \`/aliases\` and \`/arcades/venues\` send ETags) instead of re-downloading. The MCP server (\`https://mcp.dxrating.net/mcp\`) allows about 300 requests per minute per client.

## Data and credit

Free to use, including commercially. Credit is appreciated: "Data from DXRating (dxrating.net)". Song titles, artwork and charts belong to SEGA and their rights holders.

Full policy: ${API_POLICY_URL} · Changelog (subscribe): ${API_CHANGELOG_URL} · Support: ${API_SUPPORT_URL}`

/** The tags of the reference, in the order Scalar shows them: the catalog first */
const TAGS: OpenAPI.TagObject[] = [
  {
    name: 'DX Data',
    description:
      'The complete song and chart catalog in one document: songs, sheets, internal levels, versions, tags and ' +
      'aliases. The endpoint to start with.',
  },
  { name: 'Tags', description: 'Community tags of charts, and their groups.' },
  { name: 'Aliases', description: 'Community aliases (nicknames) of songs.' },
  { name: 'Arcades', description: 'Arcade venues that have maimai DX cabinets.' },
  { name: 'Analytics', description: 'Charts that are viewed most on DXRating.' },
  { name: 'Comments', description: 'Chart comments. For DXRating apps; not covered by the stability policy.' },
  { name: 'Import', description: 'Score import. For DXRating apps; not covered by the stability policy.' },
]

/** Sets the info, the tags and their order, and puts /dxdata first */
export const applyApiPolicyToOpenApi = (document: OpenAPI.OpenAPIObject): OpenAPI.OpenAPIObject => {
  document.info = {
    ...document.info,
    description: API_INFO_DESCRIPTION,
    contact: { name: 'DXRating on GitHub', url: API_SUPPORT_URL },
  }
  // Responses gain fields within v1, so a validator generated from the spec must not reject unknown properties.
  const loosen = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(loosen)
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.additionalProperties === false) delete record.additionalProperties
    Object.values(record).forEach(loosen)
  }
  loosen(document.components?.schemas)
  loosen(document.paths)
  document.externalDocs = { description: 'API stability policy', url: API_POLICY_URL }
  const named = new Set(TAGS.map((tag) => tag.name))
  const others = new Set<string>()
  for (const item of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(item ?? {})) {
      for (const tag of (operation as OpenAPI.OperationObject)?.tags ?? []) if (!named.has(tag)) others.add(tag)
    }
  }
  document.tags = [...TAGS, ...[...others].map((name) => ({ name }))]

  const order = (path: string) => {
    const operation = Object.values(document.paths?.[path] ?? {})[0] as OpenAPI.OperationObject | undefined
    const index = document.tags!.findIndex((tag) => tag.name === operation?.tags?.[0])
    return index === -1 ? document.tags!.length : index
  }
  document.paths = Object.fromEntries(
    Object.entries(document.paths ?? {}).sort(([a], [b]) => order(a) - order(b)),
  ) as OpenAPI.PathsObject
  return document
}