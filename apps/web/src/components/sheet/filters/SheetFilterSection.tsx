import { useState, type FC, type ReactNode } from 'react'
import { Button } from '@mui/material'
import { AnimatePresence, motion } from 'framer-motion'
import MdiRestore from '~icons/mdi/restore'

export const SheetFilterSection: FC<{
  titleLeft: ReactNode
  titleRight?: ReactNode
  children: ReactNode
  reset: () => void
}> = ({ titleLeft, titleRight, children, reset }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="flex flex-col gap-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <h3 className="text-lg font-semibold whitespace-nowrap flex items-center tracking-tight">
        {titleLeft}
        <AnimatePresence>
          {isHovered && (
            <Button
              sx={{ minWidth: 'auto', p: 1 }}
              className="px-1 py-1 ml-2 text-xs inline-flex"
              color="error"
              variant="outlined"
              onClick={reset}
              component={motion.div}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              layout
              whileHover={{ scale: 1.2 }}
            >
              <MdiRestore />
            </Button>
          )}
        </AnimatePresence>
        <div className="flex-1" />
        {titleRight}
      </h3>
      <div className="w-full flex flex-col md:flex-row gap-2">{children}</div>
    </div>
  )
}