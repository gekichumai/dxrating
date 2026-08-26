import { z } from 'zod'

export const SUPER_ADMIN_USER_IDS_ENV_NAME = 'SUPER_ADMIN_USER_IDS' as const
export const SUPER_ADMIN_USER_IDS_EFFECTIVE_AT_ENV_NAME = 'SUPER_ADMIN_USER_IDS_EFFECTIVE_AT' as const

const MAXIMUM_USER_ID_LENGTH = 255
const MAXIMUM_CONFIGURED_USERS = 100
const MAXIMUM_SERIALIZED_LENGTH = 64 * 1024

export interface SuperAdministratorAllowlist {
  readonly configuredUserCount: number
  hasExactUserId(userId: string): boolean
  isSessionEligibleForCurrentGeneration(userId: string, authorizationIssuedAt: Date): boolean
  /**
   * Resolves configured IDs through a trusted account repository without
   * exposing an iterable deployment allowlist to the rest of the application.
   */
  resolveExistingConfiguredUsers<T extends { readonly id: string }>(
    loadUsersById: (orderedUserIds: readonly string[]) => Promise<readonly T[]>,
  ): Promise<readonly T[]>
}

export class InvalidSuperAdministratorAllowlistError extends Error {
  constructor() {
    super(`${SUPER_ADMIN_USER_IDS_ENV_NAME} must be a JSON array of non-empty immutable user ID strings`)
    this.name = 'InvalidSuperAdministratorAllowlistError'
  }
}

export class InvalidSuperAdministratorAllowlistEffectiveAtError extends Error {
  constructor() {
    super(
      `${SUPER_ADMIN_USER_IDS_EFFECTIVE_AT_ENV_NAME} must be a UTC ISO timestamp whenever super-administrator IDs are configured`,
    )
    this.name = 'InvalidSuperAdministratorAllowlistEffectiveAtError'
  }
}

class ParsedSuperAdministratorAllowlist implements SuperAdministratorAllowlist {
  readonly #userIds: ReadonlySet<string>
  readonly #effectiveAtMilliseconds: number

  constructor(userIds: Iterable<string>, effectiveAtMilliseconds: number) {
    this.#userIds = new Set(userIds)
    this.#effectiveAtMilliseconds = effectiveAtMilliseconds
    Object.freeze(this)
  }

  get configuredUserCount() {
    return this.#userIds.size
  }

  hasExactUserId(userId: string) {
    return this.#userIds.has(userId)
  }

  isSessionEligibleForCurrentGeneration(userId: string, authorizationIssuedAt: Date) {
    const issuedAtMilliseconds = authorizationIssuedAt.getTime()
    return (
      this.#userIds.has(userId) &&
      Number.isFinite(issuedAtMilliseconds) &&
      issuedAtMilliseconds > this.#effectiveAtMilliseconds
    )
  }

  async resolveExistingConfiguredUsers<T extends { readonly id: string }>(
    loadUsersById: (orderedUserIds: readonly string[]) => Promise<readonly T[]>,
  ): Promise<readonly T[]> {
    const orderedUserIds = Object.freeze([...this.#userIds].sort())
    const loadedUsers = await loadUsersById(orderedUserIds)
    const usersById = new Map<string, T>()

    for (const loadedUser of loadedUsers) {
      if (this.#userIds.has(loadedUser.id) && !usersById.has(loadedUser.id)) {
        usersById.set(loadedUser.id, loadedUser)
      }
    }

    return Object.freeze(
      orderedUserIds.flatMap((userId) => {
        const loadedUser = usersById.get(userId)
        return loadedUser ? [loadedUser] : []
      }),
    )
  }
}

const invalidConfiguration = () => new InvalidSuperAdministratorAllowlistError()
const invalidEffectiveAt = () => new InvalidSuperAdministratorAllowlistEffectiveAtError()
const EffectiveAtSchema = z.iso.datetime()

const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
  })

const isValidConfiguredUserId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAXIMUM_USER_ID_LENGTH &&
  value === value.trim() &&
  !hasControlCharacter(value)

export const parseSuperAdministratorAllowlist = (
  serializedUserIds: string | undefined,
  serializedEffectiveAt?: string,
): SuperAdministratorAllowlist => {
  const hasSerializedUserIds = serializedUserIds !== undefined && serializedUserIds !== ''
  if (hasSerializedUserIds && serializedUserIds.length > MAXIMUM_SERIALIZED_LENGTH) throw invalidConfiguration()

  let parsed: unknown = []
  if (hasSerializedUserIds) {
    try {
      parsed = JSON.parse(serializedUserIds)
    } catch {
      throw invalidConfiguration()
    }
  }

  if (!Array.isArray(parsed) || parsed.length > MAXIMUM_CONFIGURED_USERS || !parsed.every(isValidConfiguredUserId)) {
    throw invalidConfiguration()
  }

  const uniqueUserIds = new Set(parsed)
  const hasEffectiveAt = serializedEffectiveAt !== undefined && serializedEffectiveAt !== ''
  if (!hasEffectiveAt) {
    if (uniqueUserIds.size > 0) throw invalidEffectiveAt()
    return new ParsedSuperAdministratorAllowlist(uniqueUserIds, 0)
  }

  const effectiveAt = EffectiveAtSchema.safeParse(serializedEffectiveAt)
  if (!effectiveAt.success) throw invalidEffectiveAt()
  const effectiveAtMilliseconds = new Date(effectiveAt.data).getTime()
  if (!Number.isFinite(effectiveAtMilliseconds)) throw invalidEffectiveAt()

  return new ParsedSuperAdministratorAllowlist(uniqueUserIds, effectiveAtMilliseconds)
}