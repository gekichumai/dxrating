import { Tooltip } from '@mui/material'
import clsx from 'clsx'
import type { Provenance } from '@gekichumai/maimai-domain'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiFileDocumentOutline from '~icons/mdi/file-document-outline'
import IconMdiKeyboardOutline from '~icons/mdi/keyboard-outline'
import IconMdiPencilOutline from '~icons/mdi/pencil-outline'
import IconMdiShieldCheck from '~icons/mdi/shield-check'
import { useCloudRecordProvenance } from '@/models/scores/CloudSaveUiContext'
import { describeProvenance, type ProvenanceKind } from './provenanceLabel'

const ICONS: Record<ProvenanceKind, FC<{ className?: string }>> = {
  verified: IconMdiShieldCheck,
  file: IconMdiFileDocumentOutline,
  manual: IconMdiKeyboardOutline,
  edited: IconMdiPencilOutline,
}

// Tinted, translucent surfaces on the status tokens: readable on the rows and the dialog, light and dark
const TONES: Record<ProvenanceKind, string> = {
  verified:
    'bg-[color-mix(in_oklab,var(--status-positive)_12%,transparent)] text-status-positive ring-[color-mix(in_oklab,var(--status-positive)_30%,transparent)]',
  file: 'bg-[color-mix(in_oklab,var(--status-warning)_12%,transparent)] text-status-warning ring-[color-mix(in_oklab,var(--status-warning)_30%,transparent)]',
  manual: 'bg-black/5 text-fg-2 ring-black/12',
  edited: 'bg-black/5 text-fg-2 ring-black/12',
}

const ICON_TONES: Record<ProvenanceKind, string> = {
  verified: 'text-status-positive',
  file: 'text-status-warning',
  manual: 'text-fg-2',
  edited: 'text-fg-2',
}

/** The provenance sentence of a record, as a badge (record detail) */
export const ProvenanceBadge: FC<{ provenance: Provenance; className?: string }> = ({ provenance, className }) => {
  const { t, i18n } = useTranslation(['rating-calculator'])
  const label = useMemo(() => describeProvenance(provenance, t, i18n.language), [provenance, t, i18n.language])
  const Icon = ICONS[label.kind]
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium leading-tight ring-1 ring-inset',
        TONES[label.kind],
        className,
      )}
      data-provenance={label.kind}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 text-pretty">{label.text}</span>
    </span>
  )
}

/** The provenance of a chart's record in the active cloud save; nothing on the local save */
export const RecordProvenanceBadge: FC<{ sheetId: string; className?: string }> = ({ sheetId, className }) => {
  const provenance = useCloudRecordProvenance(sheetId)
  if (!provenance) return null
  return <ProvenanceBadge provenance={provenance} className={className} />
}

/**
 * The provenance of a row as a small icon with the full sentence as its name and tooltip. Hand-entered records
 * show nothing: the icon marks where a score came from when it did not come from the user.
 */
export const RecordProvenanceIcon: FC<{ sheetId: string; className?: string }> = ({ sheetId, className }) => {
  const provenance = useCloudRecordProvenance(sheetId)
  const { t, i18n } = useTranslation(['rating-calculator'])
  const label = useMemo(
    () => (provenance ? describeProvenance(provenance, t, i18n.language) : null),
    [provenance, t, i18n.language],
  )
  if (!label || label.kind === 'manual') return null
  const Icon = ICONS[label.kind]
  return (
    <Tooltip title={label.text} enterTouchDelay={0} arrow>
      {/* A button so the sentence is reachable by keyboard and a tap shows it */}
      <button
        type="button"
        aria-label={label.text}
        className={clsx(
          'inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-sm border-none bg-transparent p-0 align-[-0.125em] outline-offset-2',
          ICON_TONES[label.kind],
          className,
        )}
        data-provenance={label.kind}
      >
        <Icon className="size-3.5" aria-hidden />
      </button>
    </Tooltip>
  )
}