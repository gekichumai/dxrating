import { Chip } from '@mui/material'
import IconMdiTag from '~icons/mdi/tag'
import { AnimatePresence, motion } from 'motion/react'
import { type CSSProperties, type FC, useMemo } from 'react'
import type { FlattenedSheet } from '../../../songs'
import { deriveColor } from '../../../utils/color'
import { MotionButtonBase, MotionTooltip } from '../../../utils/motion'
import { chipPresenceTransitions } from '../sheetMotion'
import { useLocalizedMessageTranslation } from '../../../utils/useLocalizedMessageTranslation'
import { Markdown } from '../../global/Markdown'
import { SheetTagsAddButton } from './SheetTagsAddButton'
import { useSheetTags } from './useSheetTags'

export const SheetTags: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const localizeMessage = useLocalizedMessageTranslation()
  const { data, isLoading } = useSheetTags(sheet)

  const addButton = useMemo(() => {
    return <SheetTagsAddButton key="add-button" sheet={sheet} />
  }, [sheet])

  const inner = () => {
    if (isLoading || !data) {
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
    if (data.length === 0) {
      return addButton
    }

    return [
      ...data.map((tag) => (
        <MotionTooltip
          {...chipPresenceTransitions}
          key={tag.id}
          title={<Markdown content={localizeMessage(tag.localized_description)} />}
          arrow
          slotProps={{
            popper: {
              modifiers: [
                {
                  name: 'offset',
                  options: {
                    offset: [0, -8],
                  },
                },
              ],
            },
          }}
        >
          <Chip
            key={tag.id}
            label={localizeMessage(tag.localized_name)}
            size="small"
            // Focusable, so the description tooltip also opens from the keyboard (MUI Tooltip opens on focus)
            tabIndex={0}
            // Group colours are pastels: dark mode's light chip text would vanish on them
            className="cursor-help px-0.5 dark:!text-[var(--tag-fg)]"
            style={
              {
                backgroundColor: tag.group?.color,
                '--tag-fg': tag.group?.color ? deriveColor(tag.group.color, 'text') : undefined,
              } as CSSProperties
            }
          />
        </MotionTooltip>
      )),
      addButton,
    ]
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-1 items-center gap-1">
        <IconMdiTag aria-hidden="true" className="mr-1 text-fg-2" />
      </div>

      <motion.div layoutRoot className="flex flex-wrap gap-1">
        <AnimatePresence mode="popLayout">{inner()}</AnimatePresence>
      </motion.div>
    </div>
  )
}