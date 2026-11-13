import { Chip } from '@mui/material'
import { AnimatePresence, motion } from 'motion/react'
import { type CSSProperties, type FC, useMemo, useState } from 'react'
import IconMdiTag from '~icons/mdi/tag'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { useAuth } from '../../../hooks/useAuth'
import type { FlattenedSheet } from '../../../songs'
import { deriveColor } from '../../../utils/color'
import { MotionButtonBase } from '../../../utils/motion'
import { useLocalizedMessageTranslation } from '../../../utils/useLocalizedMessageTranslation'
import { chipPresenceTransitions } from '../sheetMotion'
import { SheetTagsAddButton } from './SheetTagsAddButton'
import { TagVotePopover } from './TagVotePopover'
import { type SheetTagEntry, useSheetTagsDetailed, useUserTagVotes } from './useSheetTagsDetailed'

export const SheetTags: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const locale = useLocale()
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
    void mutate()
    void mutateUserVotes()
  }

  const renderChip = (entry: SheetTagEntry) => (
    <motion.div key={entry.id} {...chipPresenceTransitions}>
      <Chip
        label={localizeMessage(entry.tag.localized_name)}
        size="small"
        aria-haspopup="dialog"
        // Group colours are pastels: dark mode's light chip text would vanish on them
        className="cursor-pointer px-0.5 dark:!text-[var(--tag-fg)]"
        style={
          {
            backgroundColor: entry.group?.color,
            '--tag-fg': entry.group?.color ? deriveColor(entry.group.color, 'text') : undefined,
            opacity: entry.hidden ? 0.6 : undefined,
          } as CSSProperties
        }
        onClick={(event) => setSelected({ id: entry.id, anchorEl: event.currentTarget })}
      />
    </motion.div>
  )

  const inner = () => {
    if (isLoading) {
      return (
        <MotionButtonBase
          {...chipPresenceTransitions}
          className="h-6 w-16 bg-black/6 rounded-[var(--radius-md)] motion-safe:animate-pulse"
          disabled
          aria-hidden="true"
        />
      )
    }

    // AnimatePresence gets its keyed children directly: with mode="popLayout" it clones each child with a ref, which
    // a Fragment cannot take (React warns "Invalid prop `ref` supplied to `React.Fragment`")
    return [
      ...visible.map(renderChip),
      ...(hiddenExpanded ? hidden.map(renderChip) : []),
      ...(hidden.length > 0 && !hiddenExpanded
        ? [
            <MotionButtonBase
              key="hidden-tags"
              {...chipPresenceTransitions}
              className="h-6 rounded-[var(--radius-md)] border border-dashed border-black/20 px-2 text-xs text-fg-2 transition-colors hover:bg-black/5"
              onClick={() => setHiddenExpanded(true)}
            >
              {m.sheet_tags_vote_hiddenTags({ count: hidden.length }, { locale })}
            </MotionButtonBase>,
          ]
        : []),
      addButton,
    ]
  }

  return (
    <div className="flex items-start gap-1">
      <div className="flex h-6 flex-1 items-center gap-1">
        <IconMdiTag aria-hidden="true" className="mr-1 text-fg-2" />
      </div>

      <motion.div layoutRoot className="flex flex-wrap items-center gap-1">
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