import { ButtonBase, Chip } from '@mui/material'
import clsx from 'clsx'
import type { FC, ReactNode } from 'react'
import { type Control, useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { LongPressCallbackReason, useLongPress } from 'use-long-press'
import { useCombinedTags } from '../../../models/useCombinedTags'
import { useSheets } from '../../../songs'
import { useLocalizedMessageTranslation } from '../../../utils/useLocalizedMessageTranslation'
import type { SheetSortFilterForm } from '../SheetSortFilter'
import { SheetFilterSection } from './SheetFilterSection'

const SheetTagFilterInputTag = ({
  label,
  count,
  selected,
  anySelected,
  skeleton,
  onToggle,
  onOnly,
}: {
  label: ReactNode
  count: ReactNode
  selected: boolean
  anySelected: boolean
  skeleton?: boolean
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
      className={clsx('rounded-lg overflow-hidden', skeleton && 'pointer-events-none animate-pulse')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onToggle()
        }
      }}
      focusRipple
    >
      <Chip
        label={label}
        color={selected ? 'primary' : 'default'}
        size="small"
        className={clsx('!rounded-l-lg !rounded-r-none transition leading-none', !anySelected && 'opacity-50')}
      />
      <Chip
        label={count}
        color="default"
        size="small"
        className={clsx(
          '!rounded-r-lg !rounded-l-none transition leading-none !bg-gray-3',
          !anySelected && 'opacity-50',
        )}
      />
    </ButtonBase>
  )
}

const SheetTagFilterInput = ({
  value,
  onChange,
}: {
  value: number[]
  onChange: (value: number[]) => void
}) => {
  const { data: combinedTags, isLoading } = useCombinedTags()
  const tags = combinedTags?.tags
  const { data: sheets } = useSheets()
  const localizeMessage = useLocalizedMessageTranslation()

  const tagsWithCount = tags?.map((tag) => ({
    ...tag,
    count: sheets?.filter((sheet) => sheet.tags.includes(tag.id)).length,
  }))

  return (
    <div className="flex flex-wrap gap-2">
      {isLoading &&
        Array.from({ length: 8 }).map((_, i) => (
          <SheetTagFilterInputTag
            key={i}
            label={<div className="w-8">&nbsp;</div>}
            count="--"
            selected={false}
            anySelected={false}
            skeleton
            onToggle={() => {}}
            onOnly={() => {}}
          />
        ))}
      {tagsWithCount?.map((e) => (
        <SheetTagFilterInputTag
          key={e.id}
          label={localizeMessage(e.localized_name)}
          count={e.count ?? '--'}
          selected={value.includes(e.id)}
          anySelected={value.length > 0}
          onToggle={() => {
            const toggled = !value.includes(e.id)

            if (toggled) {
              onChange([...value, e.id])
            } else {
              if (value.length === 1) {
                onChange([])
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

export const SheetTagFilter: FC<{
  control: Control<SheetSortFilterForm>
}> = ({ control }) => {
  const { t } = useTranslation(['sheet', 'global'])
  const {
    field: { onChange, value },
  } = useController<SheetSortFilterForm, 'filters.tags'>({
    control,
    name: 'filters.tags',
  })

  return (
    <SheetFilterSection title={t('sheet:filter.tags.title')}>
      <SheetTagFilterInput value={value} onChange={onChange} />
    </SheetFilterSection>
  )
}
