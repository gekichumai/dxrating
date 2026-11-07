import { VersionEnum } from '@gekichumai/dxdata'
import type { Region } from './types'

/**
 * The version each server runs now: the one source of truth for "latest" per region (web region picker, version
 * update prompt, MCP default version). Update it when a server moves to a new version.
 */
export const LATEST_REGION_VERSIONS = {
  jp: VersionEnum.MAGiCAL,
  intl: VersionEnum.CiRCLEPLUS,
  cn: VersionEnum.PRiSMPLUS,
} as const satisfies Record<Exclude<Region, '_generic'>, VersionEnum>