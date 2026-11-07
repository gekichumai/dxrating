import type { Provenance } from '@gekichumai/maimai-domain'
import { m } from '@/paraglide/messages'
import type { Locale } from '@/paraglide/runtime'

/**
 * How a record's provenance reads (design §6.1, §8.4). Only `verification === 'verified'` reads as verified; a source
 * a file claims always reads as "claimed", and an account ID never shows beyond a short prefix.
 */

export type ProvenanceKind = 'verified' | 'file' | 'manual' | 'edited'

export interface ProvenanceLabel {
  kind: ProvenanceKind
  /** The full sentence: "Verified · maimai NET (JP) · friend code 1234… · fetched 2026-11-02" (`・` in ja and zh) */
  text: string
}

/** Product names, the same in every language */
const SOURCE_NAMES: Record<string, string> = {
  'maimai-net': 'maimai NET',
  'maimai-net-jp': 'maimai NET (JP)',
  'maimai-net-intl': 'maimai NET (Intl)',
  lxns: 'LXNS',
  'diving-fish': 'Diving-Fish',
  'aqua-dx': 'AquaDX',
  'mu-net': 'mu-net',
  'aqua-sqlite': 'Aqua SQLite',
  'dxrating-json': 'DXRating JSON',
}

export function sourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source
}

const ACCOUNT_PREFIX_LENGTH = 4

/**
 * The first characters of an account ID and an ellipsis. Hashed account IDs (a SEGA ID hash, §6.2) are not shown
 * at all: they mean nothing to a person.
 */
export function shortAccountId(accountId: string | null | undefined): string | null {
  if (!accountId) return null
  if (/^[0-9a-f]{64}$/.test(accountId)) return null
  return `${accountId.slice(0, ACCOUNT_PREFIX_LENGTH)}…`
}

/** A date in the visitor's time zone as `YYYY-MM-DD` (client-only surfaces: never server-rendered) */
export function formatLocalDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The joiner between the parts of a label. Latin scripts space a middle dot; Japanese and Chinese use the full-width
 * middle dot, which carries its own spacing, so nothing doubles the gap a full-width bracket already leaves.
 */
export function labelSeparator(language: string | undefined): string {
  return /^(ja|zh)(-|$)/i.test(language ?? '') ? '・' : ' · '
}

export function describeProvenance(provenance: Provenance, locale: Locale): ProvenanceLabel {
  const separator = labelSeparator(locale)
  if (provenance.verification === 'verified') {
    const parts = [m.ratingCalculator_cloudSave_provenance_verified({}, { locale }), sourceName(provenance.source)]
    const account = shortAccountId(provenance.sourceAccountId)
    if (account) {
      parts.push(
        provenance.source === 'diving-fish'
          ? m.ratingCalculator_cloudSave_provenance_account({ id: account }, { locale })
          : m.ratingCalculator_cloudSave_provenance_friendCode({ id: account }, { locale }),
      )
    }
    if (provenance.fetchedAt) {
      parts.push(
        m.ratingCalculator_cloudSave_provenance_fetched({ date: formatLocalDate(provenance.fetchedAt) }, { locale }),
      )
    }
    return { kind: 'verified', text: parts.join(separator) }
  }
  if (provenance.verification === 'user_edited') {
    return { kind: 'edited', text: m.ratingCalculator_cloudSave_provenance_edited({}, { locale }) }
  }
  if (provenance.source === 'manual') {
    return { kind: 'manual', text: m.ratingCalculator_cloudSave_provenance_manual({}, { locale }) }
  }
  const notVerified = m.ratingCalculator_cloudSave_provenance_notVerified({}, { locale })
  const fromDevice = provenance.source === 'legacy-local'
  const origin = provenance.claimedSource
    ? (fromDevice
        ? m.ratingCalculator_cloudSave_provenance_fromDeviceClaimed
        : m.ratingCalculator_cloudSave_provenance_fromFileClaimed)(
        { source: sourceName(provenance.claimedSource) },
        { locale },
      )
    : fromDevice
      ? m.ratingCalculator_cloudSave_provenance_fromDevice({}, { locale })
      : m.ratingCalculator_cloudSave_provenance_fromFile({ source: sourceName(provenance.source) }, { locale })
  return { kind: 'file', text: [origin, notVerified].join(separator) }
}