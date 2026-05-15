import { DifficultyEnum } from '@gekichumai/dxdata'
import { ButtonBase, Chip } from '@mui/material'
import { type FC, useMemo } from 'react'
import { type Control, useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { LongPressCallbackReason, useLongPress } from 'use-long-press'
import { GestureHint } from '../../global/GestureHint'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'

const DIFFICULTIES = {
  [DifficultyEnum.Basic]: 'BASIC',
  [DifficultyEnum.Advanced]: 'ADVANCED',
  [DifficultyEnum.Expert]: 'EXPERT',
  [DifficultyEnum.Master]: 'MASTER',
  [DifficultyEnum.ReMaster]: 'Re:MASTER',
}

const SheetDifficultyFilterInputDifficulty = ({
  difficulty,
  selected,
  onToggle,
  onOnly,
}: {
  difficulty: DifficultyEnum
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
      className="rounded-lg overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onToggle()
        }
      }}
      focusRipple
    >
      <Chip
        label={DIFFICULTIES[difficulty]}
        color={selected ? 'primary' : 'default'}
        size="small"
        className="!rounded-lg"
      />
    </ButtonBase>
  )
}

const DIFFICULTY_ENUMS = Object.values(DifficultyEnum)

const SheetDifficultyFilterInput = ({
  value,
  onChange,
}: {
  value: DifficultyEnum[]
  onChange: (value: DifficultyEnum[]) => void
}) => {
  const allEnums = useMemo(
    () =>
      Object.values(DifficultyEnum).map((v) => ({
        id: v,
        selected: value.includes(v),
      })),
    [value],
  )

  return (
    <div className="flex flex-wrap gap-2">
      {allEnums.map((e) => (
        <SheetDifficultyFilterInputDifficulty
          key={e.id}
          difficulty={e.id}
          selected={e.selected}
          onToggle={() => {
            const toggled = !e.selected

            if (toggled) {
              onChange([...value, e.id])
            } else {
              if (value.length === 1) {
                onChange([...DIFFICULTY_ENUMS])
              } else {
                onChange(value.filter((k) => k !== e.id))
              }
            }
          }}
          onOnly={() => {
            onChange([e.id])
          }}
        />
      ))}
    </div>
  )
}

export const SheetDifficultyFilter: FC<{
  control: Control<SheetSortFilterForm>
  reset: () => void
}> = ({ control, reset }) => {
  const { t } = useTranslation(['sheet', 'global'])
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.difficulties'>({
    control,
    name: 'filters.difficulties',
  })
  return (
    <SheetFilterSection
      titleLeft={t('sheet:filter.difficulty.title')}
      titleRight={
        <>
          <GestureHint gesture="tap" description={t('sheet:filter.difficulty.gesture-hint.tap')} />
          <GestureHint gesture="tap-hold" description={t('sheet:filter.difficulty.gesture-hint.tap-hold')} />
        </>
      }
      reset={reset}
    >
      <SheetDifficultyFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  )
}