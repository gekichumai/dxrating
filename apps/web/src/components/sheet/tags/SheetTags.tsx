import { Chip } from '@mui/material'
import { AnimatePresence, motion } from 'framer-motion'
import { type FC, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiTag from '~icons/mdi/tag'
import { useAuth } from '../../../hooks/useAuth'
import type { FlattenedSheet } from '../../../songs'
import { MotionButtonBase } from '../../../utils/motion'
import { zoomTransitions } from '../../../utils/motionConstants'
import { useLocalizedMessageTranslation } from '../../../utils/useLocalizedMessageTranslation'
import { SheetTagsAddButton } from './SheetTagsAddButton'
import { TagVotePopover } from './TagVotePopover'
import { type SheetTagEntry, useSheetTagsDetailed, useUserTagVotes } from './useSheetTagsDetailed'

const chipTransitions = {
  exit: { scale: 0.9, opacity: 0 },
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
}

export const SheetTags: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const localizeMessage = useLocalizedMessageTranslation()
  const { user } = useAuth()
  const { data, isLoading, mutate } = useSheetTagsDetailed(sheet)
  const [selected, setSelected] = useState<{ id: number; anchorEl: HTMLElement } | null>(null)
  const [hiddenExpanded, setHiddenExpanded] = useState(false)

  const tagSongIds = useMemo(() => data.map((entry) => entry.id), [data])
  const { data: userVotes, mutate: mutateUserVotes } = useUserTagVotes(tagSongIds)

  const visible = data.filter((entry) => !entry.hidden)
  const hidden = data.filter((entry) => entry.hidden)
  // Resolved from the live list rather than captured on click, so the popover
  // reflects vote counts as soon as they are revalidated.
  const selectedEntry = selected ? data.find((entry) => entry.id === selected.id) : undefined

  const addButton = useMemo(() => {
    return <SheetTagsAddButton key="add-button" sheet={sheet} />
  }, [sheet])

  const onChanged = () => {
    mutate()
    mutateUserVotes()
  }

  const renderChip = (entry: SheetTagEntry) => (
    <motion.div key={entry.id} {...chipTransitions}>
      <Chip
        label={localizeMessage(entry.tag.localized_name)}
        size="small"
        className="cursor-pointer px-0.5"
        style={{
          backgroundColor: entry.group?.color,
          opacity: entry.hidden ? 0.5 : undefined,
        }}
        onClick={(event) => setSelected({ id: entry.id, anchorEl: event.currentTarget })}
      />
    </motion.div>
  )

  const inner = () => {
    if (isLoading) {
      return (
        <MotionButtonBase {...zoomTransitions} className="h-6 w-16 bg-gray-200 rounded-lg animate-pulse" disabled />
      )
    }

    return (
      <>
        {visible.map(renderChip)}
        {hiddenExpanded && hidden.map(renderChip)}

        {hidden.length > 0 && !hiddenExpanded && (
          <MotionButtonBase
            key="hidden-tags"
            {...chipTransitions}
            className="h-6 rounded-lg border-1 border-dashed border-gray-300 bg-transparent px-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-100 transition"
            onClick={() => setHiddenExpanded(true)}
          >
            {t('sheet:tags.vote.hidden-tags', { count: hidden.length })}
          </MotionButtonBase>
        )}

        {addButton}
      </>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-1 items-center gap-1">
        <IconMdiTag className="mr-1" />
      </div>

      <motion.div layoutRoot className="flex flex-wrap gap-1">
        <AnimatePresence mode="popLayout">{inner()}</AnimatePresence>
      </motion.div>

      {selected && selectedEntry && (
        <TagVotePopover
          entry={selectedEntry}
          anchorEl={selected.anchorEl}
          userVote={userVotes[String(selectedEntry.id)] ?? null}
          currentUserId={user?.id}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}