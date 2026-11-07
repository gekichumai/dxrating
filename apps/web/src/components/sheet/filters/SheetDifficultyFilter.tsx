import { DifficultyEnum } from '@gekichumai/dxdata'
import { ButtonBase, Chip } from '@mui/material'
import { type FC, useMemo } from 'react'
import { type Control, useController } from 'react-hook-form'
import { LongPressCallbackReason, useLongPress } from 'use-long-press'
import { GestureHint } from '../../global/GestureHint'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

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
      aria-pressed={selected}
      className="rounded-lg overflow-hidden"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        // Shift+Enter is the keyboard path to "select only", which pointers get by holding
        if (e.shiftKey) onOnly()
        else onToggle()
      }}
      focusRipple
    >
      <Chip
        label={DIFFICULTIES[difficulty]}
        color={selected ? 'primary' : 'default'}
        // Filled when selected, outlined when not: the state does not rest on colour alone
        variant={selected ? 'filled' : 'outlined'}
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
  const locale = useLocale()
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.difficulties'>({
    control,
    name: 'filters.difficulties',
  })
  return (
    <SheetFilterSection
      titleLeft={m.sheet_filter_difficulty_title({}, { locale })}
      titleRight={
        <>
          <GestureHint gesture="tap" description={m.sheet_filter_difficulty_gestureHint_tap({}, { locale })} />
          <GestureHint gesture="tap-hold" description={m.sheet_filter_difficulty_gestureHint_tapHold({}, { locale })} />
        </>
      }
      reset={reset}
    >
      <SheetDifficultyFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  )
}