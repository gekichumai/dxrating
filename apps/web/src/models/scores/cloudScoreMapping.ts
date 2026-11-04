import type { RecordDTO, SetValue } from '@gekichumai/api-contract'
import {
  fromAchievementInt,
  toAchievementInt,
  type ExistingScoreRecord,
  type ImportProvider,
  type ScoreSource,
  type SheetIdentity,
} from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import type { ManualEntry, ScoreRecord } from './ScoreRepository'

/**
 * Mapping between the cloud save wire format (`RecordDTO`, design §5.1) and the web's score shapes (`ScoreRecord`
 * for readers, `PlayEntry` for the rating calculator).
 */

/** A record of a cloud save as this device sees it: the server's, or the server's with pending changes on top */
export interface CloudRecord extends ExistingScoreRecord {
  sheetId: string
  /** A pending outbox change produced this value; the server has not confirmed it yet */
  pending: boolean
}

export function recordFromDTO(dto: RecordDTO): CloudRecord {
  return {
    sheetId: dto.sheetId,
    achievement: dto.achievement,
    comboFlag: dto.comboFlag,
    syncFlag: dto.syncFlag,
    dxScore: dto.dxScore,
    best50Bucket: dto.best50Bucket,
    providerRecordId: dto.providerRecordId,
    provenance: dto.provenance,
    revision: dto.revision,
    deletedAt: dto.deletedAt,
    pending: false,
  }
}

const PROVIDER_BY_SOURCE: Partial<Record<ScoreSource, ImportProvider>> = {
  'maimai-net-jp': 'maimai-net',
  'maimai-net-intl': 'maimai-net',
  lxns: 'lxns',
  'diving-fish': 'diving-fish',
  'aqua-dx': 'aqua-dx',
  'mu-net': 'mu-net',
  'aqua-sqlite': 'aqua-sqlite',
}

/** The import provider of a record's source, as `PlayEntry.source` names it; none for manual and file records */
export function providerOfSource(source: ScoreSource): ImportProvider | undefined {
  return PROVIDER_BY_SOURCE[source]
}

export function cloudRecordToScoreRecord(record: CloudRecord, identity: SheetIdentity): ScoreRecord {
  return {
    sheetId: record.sheetId,
    identity,
    achievement: record.achievement,
    achievementRate: fromAchievementInt(record.achievement),
    comboFlag: record.comboFlag,
    syncFlag: record.syncFlag,
    dxScore: record.dxScore,
    // `calculateBest50` honours Diving-Fish hints only, as the local save does (`playEntryToScoreRecord`). A
    // `legacy-local` record carries a hint only where the device's calculator honoured one (clients send Diving-Fish
    // hints only), so it keeps reading the same; the hint never changes the record's verification
    best50Bucket:
      record.provenance.source === 'diving-fish' || record.provenance.source === 'legacy-local'
        ? record.best50Bucket
        : null,
    provenance: record.provenance,
  }
}

/** The calculator's entry of a record, in the format the local save and JSON exports use */
export function cloudRecordToPlayEntry(record: CloudRecord, identity: SheetIdentity | null | undefined): PlayEntry {
  const entry: PlayEntry = {
    sheetId: record.sheetId,
    achievementRate: fromAchievementInt(record.achievement),
    comboFlag: record.comboFlag,
    syncFlag: record.syncFlag,
  }
  if (identity) entry.identity = identity
  if (record.dxScore !== null) entry.dxScore = record.dxScore
  const provider = providerOfSource(record.provenance.source)
  if (provider) {
    entry.source = { provider }
    if (record.providerRecordId !== null) entry.source.providerId = record.providerRecordId
    if (provider === 'diving-fish' && record.best50Bucket !== null) entry.source.best50Bucket = record.best50Bucket
  }
  return entry
}

/** The `set` value of a manual entry; throws when its achievement is not a valid percentage */
export function manualEntryToSetValue(entry: ManualEntry): SetValue {
  const achievement = typeof entry.achievementRate === 'number' ? toAchievementInt(entry.achievementRate) : null
  if (achievement === null) {
    throw new RangeError(`Achievement out of range: ${String(entry.achievementRate)}`)
  }
  return {
    achievement,
    comboFlag: entry.comboFlag ?? null,
    syncFlag: entry.syncFlag ?? null,
    dxScore: typeof entry.dxScore === 'number' ? entry.dxScore : null,
  }
}

/** Live records only: the server's checksum (§5.8) */
export function checksumOf(records: Iterable<Pick<CloudRecord, 'achievement' | 'deletedAt'>>) {
  let count = 0
  let sumAchievement = 0
  for (const record of records) {
    if (record.deletedAt !== null) continue
    count++
    sumAchievement += record.achievement
  }
  return { count, sumAchievement }
}