import { IconButton } from '@mui/material'
import { motion } from 'framer-motion'
import { FC, memo, useState } from 'react'

import { useSheetFavoriteState } from '../../models/favorite'
import { FlattenedSheet } from '../../songs'

import MdiStar from '~icons/mdi/star'
import MdiStarOutline from '~icons/mdi/star-outline'

export const SheetDialogContentHeader: FC<{ sheet: FlattenedSheet }> = memo(({ sheet }) => {
  const [favored, toggleFavored] = useSheetFavoriteState(sheet.id)
  const [expanded, setExpanded] = useState(false)

  const variants = {
    collapsed: {
      height: '4rem',
      width: '4rem',
      borderRadius: '0.5rem',
      cursor: 'zoom-in',
    },
    expanded: {
      height: '14rem',
      width: '14rem',
      borderRadius: '1rem',
      cursor: 'zoom-out',
    },
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-start">
        <div className="text-xs text-zinc-400">#{sheet.internalId ?? '?'}</div>

        <div className="flex-1" />

        <IconButton size="small" onClick={() => toggleFavored()}>
          <motion.div
            layout
            variants={{
              favored: { rotate: 360 / 5 },
              unfavored: { rotate: 0 },
            }}
            initial={favored ? 'favored' : 'unfavored'}
            animate={favored ? 'favored' : 'unfavored'}
            transition={{
              type: 'spring',
              damping: 18,
              stiffness: 235,
            }}
          >
            {favored ? <MdiStar className="text-yellow-500" /> : <MdiStarOutline />}
          </motion.div>
        </IconButton>
      </div>
      <div className="flex items-center">
        <motion.img
          layout
          src={`https://shama.dxrating.net/images/cover/v2/${sheet.imageName}.jpg`}
          alt={sheet.imageName}
          className="overflow-hidden rounded-lg bg-slate-300/50"
          variants={variants}
          initial="collapsed"
          animate={expanded ? 'expanded' : 'collapsed'}
          transition={{
            type: 'spring',
            damping: 18,
            stiffness: 235,
          }}
          onClick={() => setExpanded((prev) => !prev)}
          role="button"
          data-attr="sheet-image"
        />

        <div className="flex-1" />

        <div className="text-4xl text-zinc-900/60 leading-none">
          {sheet.isTypeUtage ? sheet.level : sheet.internalLevelValue.toFixed(1)}
        </div>
      </div>
    </div>
  )
})
