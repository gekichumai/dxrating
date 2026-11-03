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

// Tinted, translucent surfaces: readable on the light rows and the dialog alike
const TONES: Record<ProvenanceKind, string> = {
  verified: 'bg-emerald-500/12 text-emerald-800 ring-emerald-700/20',
  file: 'bg-amber-500/12 text-amber-900 ring-amber-700/20',
  manual: 'bg-zinc-500/10 text-zinc-700 ring-zinc-600/20',
  edited: 'bg-zinc-500/10 text-zinc-700 ring-zinc-600/20',
}

const ICON_TONES: Record<ProvenanceKind, string> = {
  verified: 'text-emerald-600',
  file: 'text-amber-600',
  manual: 'text-zinc-500',
  edited: 'text-zinc-500',
}

/** The provenance sentence of a record, as a badge (record detail) */
export const ProvenanceBadge: FC<{ provenance: Provenance; className?: string }> = ({ provenance, className }) => {
  const { t } = useTranslation(['rating-calculator'])
  const label = useMemo(() => describeProvenance(provenance, t), [provenance, t])
  const Icon = ICONS[label.kind]
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium leading-tight ring-1 ring-inset',
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
  const { t } = useTranslation(['rating-calculator'])
  const label = useMemo(() => (provenance ? describeProvenance(provenance, t) : null), [provenance, t])
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