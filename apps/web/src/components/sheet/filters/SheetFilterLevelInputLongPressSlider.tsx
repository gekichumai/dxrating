import { ClickAwayListener } from '@mui/material'
import MdiGestureSwipeVertical from '~icons/mdi/gesture-swipe-vertical'
import { AnimatePresence, motion } from 'framer-motion'
import { TouchEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLockBodyScroll } from 'react-use'
import { mapRange } from '../../../utils/mapRange'

export const SheetFilterInternalLevelInputLongPressSlider = ({
  value,
  onChange,
  min,
  max,
}: {
  value?: number
  onChange: (value: number) => void
  min: number
  max: number
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPressed, setIsPressed] = useState(false)
  const inclusiveWholeNumbers = useMemo(
    () => Array.from({ length: max - min + 1 }).map((_, i) => min + i),
    [min, max]
  )
  useLockBodyScroll(isPressed)

  useEffect(() => {
    document.body.style.userSelect = isPressed ? 'none' : ''
    return () => {
      document.body.style.userSelect = ''
    }
  }, [isPressed])

  const valuePercentage = ((value ?? 0) - min) / (max - min)

  const onPointerMove: TouchEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (!isPressed) return
      if (!containerRef.current) return
      if (e.touches.length !== 1) return
      const { top, height } = containerRef.current.getBoundingClientRect()
      const padding = 16 + 10 // each side; padding + half size of text mark
      const offset = e.touches[0].clientY - top
      const mappedOffset = mapRange(offset, 0, height, -padding, height - padding)
      const percentageFromTop = mappedOffset / (height - padding * 2)
      const unroundedValue = (max - min) * percentageFromTop + min
      const unclampedValue = Math.round(unroundedValue * 10) / 10
      const value = Math.max(min, Math.min(max, unclampedValue))
      onChange(value)
    },
    [isPressed, containerRef, min, max, onChange]
  )

  const indicatorPosition = useMemo(() => {
    if (!containerRef.current) return 0
    const { height } = containerRef.current.getBoundingClientRect()
    const padding = 8 // each side
    const indicatorHeight = 32
    return mapRange(
      valuePercentage * height,
      0,
      height,
      padding,
      height - padding - indicatorHeight
    )
  }, [containerRef, valuePercentage])

  return (
    <ClickAwayListener onClickAway={() => setIsPressed(false)}>
      <div className="relative select-none">
        <div
          className="cursor-row-resize bg-white/50 rounded-full shadow touch-none flex items-center justify-center h-14 w-10 active:bg-white/100 transition duration-75"
          onTouchStart={() => {
            setIsPressed(true)
          }}
          onTouchMove={onPointerMove}
          onTouchEnd={() => setIsPressed(false)}
          tabIndex={-1}
        >
          <MdiGestureSwipeVertical fontSize="1rem" />
        </div>
        <AnimatePresence>
          {isPressed && (
            <motion.div
              className="absolute top-7 left-0 w-10 h-[50svh] flex flex-col items-center justify-between bg-gray-200 px-2 py-4 shadow rounded-full z-10"
              ref={containerRef}
              initial={{ opacity: 0, scaleY: 0.5, y: '-50%' }}
              animate={{ opacity: 1, scaleY: 1, y: '-50%' }}
              exit={{ opacity: 0, scaleY: 0.5, y: '-50%' }}
            >
              {inclusiveWholeNumbers.map((i) => (
                <div key={i} className="text-sm text-black/50 font-mono">
                  {i}
                </div>
              ))}
              {value !== undefined && value >= min && value <= max && (
                <div
                  className="h-8 w-8 rounded-full bg-gray-600/80 text-white flex items-center justify-center absolute left-0 text-xs left-1"
                  style={{
                    top: `${indicatorPosition}px`,
                  }}
                >
                  {value}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ClickAwayListener>
  )
}
