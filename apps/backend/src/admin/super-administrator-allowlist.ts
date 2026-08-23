export const SUPER_ADMIN_USER_IDS_ENV_NAME = 'SUPER_ADMIN_USER_IDS' as const

const MAXIMUM_USER_ID_LENGTH = 255
const MAXIMUM_CONFIGURED_USERS = 100
const MAXIMUM_SERIALIZED_LENGTH = 64 * 1024

export interface SuperAdministratorAllowlist {
  readonly configuredUserCount: number
  hasExactUserId(userId: string): boolean
}

export class InvalidSuperAdministratorAllowlistError extends Error {
  constructor() {
    super(`${SUPER_ADMIN_USER_IDS_ENV_NAME} must be a JSON array of non-empty immutable user ID strings`)
    this.name = 'InvalidSuperAdministratorAllowlistError'
  }
}

class ParsedSuperAdministratorAllowlist implements SuperAdministratorAllowlist {
  readonly #userIds: ReadonlySet<string>

  constructor(userIds: Iterable<string>) {
    this.#userIds = new Set(userIds)
    Object.freeze(this)
  }

  get configuredUserCount() {
    return this.#userIds.size
  }

  hasExactUserId(userId: string) {
    return this.#userIds.has(userId)
  }
}

const invalidConfiguration = () => new InvalidSuperAdministratorAllowlistError()

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
): SuperAdministratorAllowlist => {
  if (serializedUserIds === undefined || serializedUserIds === '') {
    return new ParsedSuperAdministratorAllowlist([])
  }
  if (serializedUserIds.length > MAXIMUM_SERIALIZED_LENGTH) throw invalidConfiguration()

  let parsed: unknown
  try {
    parsed = JSON.parse(serializedUserIds)
  } catch {
    throw invalidConfiguration()
  }

  if (!Array.isArray(parsed) || parsed.length > MAXIMUM_CONFIGURED_USERS || !parsed.every(isValidConfiguredUserId)) {
    throw invalidConfiguration()
  }

  return new ParsedSuperAdministratorAllowlist(parsed)
}