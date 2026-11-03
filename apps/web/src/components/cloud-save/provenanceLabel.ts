import type { Provenance } from '@gekichumai/maimai-domain'
import type { TFunction } from 'i18next'

/**
 * How a record's provenance reads (design §6.1, §8.4). Only `verification === 'verified'` reads as verified; a source
 * a file claims always reads as "claimed", and an account ID never shows beyond a short prefix.
 */

export type ProvenanceKind = 'verified' | 'file' | 'manual' | 'edited'

export interface ProvenanceLabel {
  kind: ProvenanceKind
  /** The full sentence: "Verified · maimai NET (JP) · friend code 1234… · fetched 2026-11-02" */
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

export function describeProvenance(provenance: Provenance, t: TFunction): ProvenanceLabel {
  const separator = ' · '
  if (provenance.verification === 'verified') {
    const parts = [t('rating-calculator:cloud-save.provenance.verified'), sourceName(provenance.source)]
    const account = shortAccountId(provenance.sourceAccountId)
    if (account) {
      parts.push(
        provenance.source === 'diving-fish'
          ? t('rating-calculator:cloud-save.provenance.account', { id: account })
          : t('rating-calculator:cloud-save.provenance.friend-code', { id: account }),
      )
    }
    if (provenance.fetchedAt) {
      parts.push(t('rating-calculator:cloud-save.provenance.fetched', { date: formatLocalDate(provenance.fetchedAt) }))
    }
    return { kind: 'verified', text: parts.join(separator) }
  }
  if (provenance.verification === 'user_edited') {
    return { kind: 'edited', text: t('rating-calculator:cloud-save.provenance.edited') }
  }
  if (provenance.source === 'manual') {
    return { kind: 'manual', text: t('rating-calculator:cloud-save.provenance.manual') }
  }
  const notVerified = t('rating-calculator:cloud-save.provenance.not-verified')
  const fromDevice = provenance.source === 'legacy-local'
  const origin = provenance.claimedSource
    ? t(
        fromDevice
          ? 'rating-calculator:cloud-save.provenance.from-device-claimed'
          : 'rating-calculator:cloud-save.provenance.from-file-claimed',
        { source: sourceName(provenance.claimedSource) },
      )
    : fromDevice
      ? t('rating-calculator:cloud-save.provenance.from-device')
      : t('rating-calculator:cloud-save.provenance.from-file', { source: sourceName(provenance.source) })
  return { kind: 'file', text: [origin, notVerified].join(separator) }
}