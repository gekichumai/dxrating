import type { VersionEnum } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { getFlattenedSheets, type FlattenedSheet } from '@/songs'

/** The songs of the bundled catalog snapshot */
export const getSnapshotSongs = () => catalogSnapshot.songs

/** The flattened sheets of the bundled catalog snapshot under a version */
export const getSnapshotFlattenedSheets = (version: VersionEnum): FlattenedSheet[] =>
  getFlattenedSheets(getSongCatalog(catalogSnapshot, version))