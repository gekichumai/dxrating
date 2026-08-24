import { describe, expect, it } from 'vitest'
import { auth } from './auth.js'
import { AUTH_ROUTE_INVENTORY } from './auth-ban-enforcement.js'

const normalizeMethods = (method: string | readonly string[] | undefined): readonly string[] =>
  (Array.isArray(method) ? method : method ? [method] : []).map((item) => item.toUpperCase()).sort()

describe('Better Auth route inventory', () => {
  it('classifies the exact path and method of every enabled endpoint', () => {
    const actual = Object.entries(auth.api)
      .map(([operation, endpoint]) => ({
        operation,
        path: endpoint.path ?? null,
        methods: normalizeMethods(endpoint.options?.method),
      }))
      .sort((left, right) => left.operation.localeCompare(right.operation))
    const expected = AUTH_ROUTE_INVENTORY.map(({ operation, path, methods }) => ({
      operation,
      path,
      methods: [...methods].sort(),
    })).sort((left, right) => left.operation.localeCompare(right.operation))

    expect(actual).toEqual(expected)
  })

  it('has one explicit policy for every routable path/method identity', () => {
    const identities = AUTH_ROUTE_INVENTORY.flatMap((entry) =>
      entry.path === null ? [] : entry.methods.map((method) => `${entry.path}\u0000${method}`),
    )
    expect(new Set(identities).size).toBe(identities.length)

    const policies = new Set(AUTH_ROUTE_INVENTORY.map((entry) => entry.policy))
    expect(policies).not.toContain(undefined)
    expect(policies).toEqual(
      new Set([
        'authentication',
        'internal_session_write',
        'proof_write',
        'public',
        'safe_sign_out',
        'session_probe',
        'session_read',
        'session_write',
      ]),
    )
  })

  it('keeps every routable path policy-homogeneous for programmatic calls without a method', () => {
    const policiesByPath = new Map<string, Set<string>>()
    for (const entry of AUTH_ROUTE_INVENTORY) {
      if (entry.path === null) continue
      const policies = policiesByPath.get(entry.path) ?? new Set<string>()
      policies.add(entry.policy)
      policiesByPath.set(entry.path, policies)
    }

    const heterogeneousPaths = [...policiesByPath]
      .filter(([, policies]) => policies.size !== 1)
      .map(([path, policies]) => ({ path, policies: [...policies].sort() }))
    expect(heterogeneousPaths).toEqual([])
  })

  it('keeps sign-out as the sole banned-session escape hatch', () => {
    expect(AUTH_ROUTE_INVENTORY.filter((entry) => entry.policy === 'safe_sign_out')).toEqual([
      { operation: 'signOut', path: '/sign-out', methods: ['POST'], policy: 'safe_sign_out' },
    ])
    expect(
      AUTH_ROUTE_INVENTORY.filter((entry) =>
        ['changeEmail', 'changePassword', 'deleteUser', 'linkSocialAccount', 'unlinkAccount', 'updateUser'].includes(
          entry.operation,
        ),
      ).every((entry) => entry.policy === 'session_write'),
    ).toBe(true)
  })

  it('keeps the sole pathless internal endpoint classified until a caller deliberately exposes it', () => {
    expect(AUTH_ROUTE_INVENTORY.filter((entry) => entry.path === null)).toEqual([
      {
        operation: 'setPassword',
        path: null,
        methods: ['POST'],
        policy: 'internal_session_write',
      },
    ])
  })
})