import { VERSION_ID_MAP, VERSION_IDS, type VersionEnum } from '@gekichumai/dxdata'
import { ButtonBase } from '@mui/material'
import clsx from 'clsx'
import { type FC, useMemo } from 'react'
import MdiCheck from '~icons/mdi/check'
import { type Control, useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { LongPressCallbackReason, useLongPress } from 'use-long-press'
import { useAppContextDXDataVersion } from '../../../models/context/useAppContext'
import { GestureHint } from '../../global/GestureHint'
import { VersionLogo } from '../../version/VersionLogo'
import { VersionEraPager, VersionPairGrid } from '../../version/VersionPairList'
import { VERSION_ERAS, pairVersionsByEra, versionEraOf } from '../../version/versionEras'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'

const SheetVersionFilterInputVersion = ({
  version,
  selected,
  onToggle,
  onOnly,
}: {
  version: VersionEnum
  selected: boolean
  onToggle: () => void
  onOnly: () => void
}) => {
  const bind = useLongPress(onOnly, {
    threshold: 300,
    captureEvent: true,
    cancelOnMovement: true,
    onCancel: (_, meta) => {
      if (meta.reason === LongPressCallbackReason.CancelledByRelease) {
        onToggle()
      }
    },
  })

  return (
    <ButtonBase
      {...bind()}
      aria-pressed={selected}
      title={version}
      className={clsx(
        '!flex !justify-between w-full min-w-0 gap-1 !px-1.5 !py-1 !rounded-[var(--radius-md)] text-left transition-[background-color,box-shadow,opacity] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        selected
          ? 'glass-thin !bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] shadow-[inset_0_0_0_1.5px_var(--accent)]'
          : 'glass-inset opacity-70 hover:opacity-100',
      )}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        // Shift+Enter is the keyboard path to "select only", which pointers get by holding
        if (e.shiftKey) onOnly()
        else onToggle()
      }}
      focusRipple
    >
      <VersionLogo version={version} className="h-8 flex-1 min-w-0 text-[0.625rem]" />
      {/* The pressed state does not rest on colour alone */}
      <MdiCheck aria-hidden className={clsx('size-4 shrink-0 text-accent-strong', !selected && 'invisible')} />
    </ButtonBase>
  )
}

const SheetVersionFilterInput = ({
  value,
  onChange,
}: {
  value: VersionEnum[]
  onChange: (value: VersionEnum[]) => void
}) => {
  const { t } = useTranslation(['versions'])
  const appVersion = useAppContextDXDataVersion()
  const allEnums = useMemo(
    () =>
      VERSION_IDS.map((k) => ({
        id: k,
        selected: value.includes(k),
      })).filter((v) => (VERSION_ID_MAP.get(v.id) ?? 0) <= (VERSION_ID_MAP.get(appVersion) ?? 0)),
    [value, appVersion],
  )

  const available = useMemo(() => allEnums.map((e) => e.id), [allEnums])
  const selected = useMemo(() => new Set(allEnums.filter((e) => e.selected).map((e) => e.id)), [allEnums])

  const toggle = (version: VersionEnum) => {
    if (!selected.has(version)) {
      onChange([...value, version])
    } else if (value.length === 1) {
      onChange([...VERSION_IDS])
    } else {
      onChange(value.filter((k) => k !== version))
    }
  }

  const badges = Object.fromEntries(
    VERSION_ERAS.map((era) => {
      const inEra = available.filter((version) => versionEraOf(version) === era)
      return [era, `${inEra.filter((version) => selected.has(version)).length}/${inEra.length}`]
    }),
  )

  return (
    <VersionEraPager label={t('versions:era.label')} badges={badges}>
      {(era) => (
        <VersionPairGrid
          className="gap-1.5 sm:grid-cols-2 sm:gap-x-3"
          pairs={pairVersionsByEra(available, era)}
          renderVersion={(version) => (
            <SheetVersionFilterInputVersion
              key={version}
              version={version}
              selected={selected.has(version)}
              onToggle={() => toggle(version)}
              onOnly={() => onChange([version])}
            />
          )}
        />
      )}
    </VersionEraPager>
  )
}

export const SheetVersionFilter: FC<{
  control: Control<SheetSortFilterForm>
  reset: () => void
}> = ({ control, reset }) => {
  const { t } = useTranslation(['sheet', 'global'])
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.versions'>({
    control,
    name: 'filters.versions',
  })

  return (
    <SheetFilterSection
      titleLeft={t('sheet:filter.version.title')}
      titleRight={
        <>
          <GestureHint gesture="tap" description={t('sheet:filter.version.gesture-hint.tap')} />
          <GestureHint gesture="tap-hold" description={t('sheet:filter.version.gesture-hint.tap-hold')} />
        </>
      }
      reset={reset}
    >
      <SheetVersionFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  )
}