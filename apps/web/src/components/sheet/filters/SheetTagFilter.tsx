import { ButtonBase, Chip } from '@mui/material'
import clsx from 'clsx'
import type { FC, ReactNode } from 'react'
import { type Control, useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { LongPressCallbackReason, useLongPress } from 'use-long-press'
import { Markdown } from '../../global/Markdown'
import { useCombinedTags } from '../../../models/useCombinedTags'
import { useSheets } from '../../../songs'
import { MotionTooltip } from '../../../utils/motion'
import { zoomTransitions } from '../../../utils/motionConstants'
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

const SheetTagFilterInput = ({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) => {
  const { data: combinedTags, isLoading } = useCombinedTags()
  const tags = combinedTags?.tags
  const tagGroups = combinedTags?.tagGroups
  const { data: sheets } = useSheets()
  const localizeMessage = useLocalizedMessageTranslation()

  const tagsWithCount = tags?.map((tag) => ({
    ...tag,
    count: sheets?.filter((sheet) => sheet.tags.includes(tag.id)).length,
  }))

  const groupedTags = tagGroups?.map((group) => ({
    ...group,
    tags: tagsWithCount?.filter((tag) => tag.group_id === group.id) ?? [],
  }))

  const renderTag = (e: NonNullable<typeof tagsWithCount>[number]) => (
    <MotionTooltip
      {...zoomTransitions}
      key={e.id}
      title={<Markdown content={localizeMessage(e.localized_description)} />}
      arrow
      slotProps={{
        popper: { modifiers: [{ name: 'offset', options: { offset: [0, -8] } }] },
      }}
    >
      <span>
        <SheetTagFilterInputTag
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
      </span>
    </MotionTooltip>
  )

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SheetTagFilterInputTag
            // oxlint-disable-next-line react/no-array-index-key -- index is stable
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
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groupedTags?.map((group) => (
        <div key={group.id} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
            <span className="text-xs font-medium text-zinc-500 tracking-tight">
              {localizeMessage(group.localized_name)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">{group.tags.map(renderTag)}</div>
        </div>
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