import { PUBLIC_PROCEDURE_ACCESS_MODES } from '@gekichumai/api-contract'
import { describe, expect, it } from 'vitest'
import { appContract } from './contract.js'

const collectAccessInventory = (
  node: Record<string, unknown>,
  prefix: readonly string[] = [],
): Record<string, string> => {
  const inventory: Record<string, string> = {}
  for (const [name, value] of Object.entries(node)) {
    if (!value || typeof value !== 'object') continue
    const candidate = value as Record<string, unknown>
    const definition = candidate['~orpc'] as
      | { readonly route?: unknown; readonly meta?: { readonly access?: unknown } }
      | undefined
    const path = [...prefix, name]
    if (definition?.route) {
      inventory[path.join('.')] = String(definition.meta?.access)
      continue
    }
    Object.assign(inventory, collectAccessInventory(candidate, path))
  }
  return inventory
}

describe('public procedure access inventory', () => {
  it('requires an explicit recognized policy for every backend procedure', () => {
    const inventory = collectAccessInventory(appContract)
    expect(inventory).toEqual({
      'aliases.create': 'authenticated_write',
      'aliases.list': 'public_read',
      'analytics.trending': 'public_read',
      'arcades.games': 'public_read',
      'arcades.venue': 'public_read',
      'arcades.venues': 'public_read',
      'chartOgImage.render': 'public_read',
      'chartReports.create': 'authenticated_write',
      'comments.create': 'authenticated_write',
      'comments.list': 'public_read',
      'lxns.authorize': 'authenticated_write',
      'lxns.disconnect': 'authenticated_write',
      'lxns.start': 'authenticated_write',
      'lxns.status': 'authenticated_read',
      'maimai.fetchRecords': 'identity_independent',
      'tags.attach': 'authenticated_write',
      'tags.list': 'public_read',
    })
    expect(Object.values(inventory).every((access) => PUBLIC_PROCEDURE_ACCESS_MODES.includes(access as never))).toBe(
      true,
    )
  })
})