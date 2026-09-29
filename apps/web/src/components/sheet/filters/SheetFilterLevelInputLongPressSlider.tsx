import { ClickAwayListener } from '@mui/material'
import MdiGestureSwipeVertical from '~icons/mdi/gesture-swipe-vertical'
import { AnimatePresence, motion } from 'framer-motion'
import { type TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation(['sheet'])
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPressed, setIsPressed] = useState(false)
  const inclusiveWholeNumbers = useMemo(() => Array.from({ length: max - min + 1 }).map((_, i) => min + i), [min, max])
  useLockBodyScroll(isPressed)

  useEffect(() => {
    document.body.style.userSelect = isPressed ? 'none' : ''
    return () => {
      document.body.style.userSelect = ''
    }
  }, [isPressed])

  const valuePercentage = ((value ?? 0) - min) / (max - min)

  const onPointerMove = useCallback(
    (e: MouseEvent | TouchEvent<HTMLButtonElement>) => {
      if (!isPressed) return
      if (containerRef.current === null) return
      if ('touches' in e && e.touches.length !== 1) return

      const { top, height } = containerRef.current.getBoundingClientRect()
      const padding = 16 + 10 // each side; padding + half size of text mark
      const offset = ('touches' in e ? e.touches[0] : e).clientY - top
      const mappedOffset = mapRange(offset, 0, height, -padding, height - padding)
      const percentageFromTop = mappedOffset / (height - padding * 2)
      const unroundedValue = (max - min) * percentageFromTop + min
      const unclampedValue = Math.round(unroundedValue * 10) / 10
      const value = Math.max(min, Math.min(max, unclampedValue))
      onChange(value)
    },
    [isPressed, containerRef, min, max, onChange],
  )

  useEffect(() => {
    document.addEventListener('mousemove', onPointerMove)
    return () => {
      document.removeEventListener('mousemove', onPointerMove)
    }
  }, [onPointerMove])

  const indicatorPosition = useMemo(() => {
    if (containerRef.current === null) return 0
    const { height } = containerRef.current.getBoundingClientRect()
    const padding = 8 // each side
    const indicatorHeight = 32
    return mapRange(valuePercentage * height, 0, height, padding, height - padding - indicatorHeight)
  }, [containerRef, valuePercentage])

  return (
    <ClickAwayListener mouseEvent="onMouseUp" onClickAway={() => setIsPressed(false)}>
      <div className="relative select-none">
        <button
          type="button"
          aria-label={t('sheet:filter.internal-level-value.title')}
          className="border-0 p-0 cursor-row-resize bg-white/50 rounded-full shadow touch-none flex items-center justify-center h-14 w-10 active:bg-white/100 transition duration-75"
          onTouchStart={() => {
            setIsPressed(true)
          }}
          onTouchMove={onPointerMove}
          onTouchEnd={() => setIsPressed(false)}
          onMouseDown={() => {
            setIsPressed(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              const steppedValue = (value ?? min) + (event.key === 'ArrowUp' ? 0.1 : -0.1)
              const roundedValue = Math.round(steppedValue * 10) / 10
              onChange(Math.max(min, Math.min(max, roundedValue)))
            }
          }}
        >
          <MdiGestureSwipeVertical fontSize="1rem" />
        </button>
        <AnimatePresence>
          {isPressed && (
            <motion.div
              className="absolute top-7 left-0 w-10 h-[50svh] flex flex-col items-center justify-between bg-gray-200 px-2 py-4 shadow rounded-full z-10"
              ref={containerRef}
              initial={{ opacity: 0, scaleY: 0.5, y: '-50%' }}
              animate={{ opacity: 1, scaleY: 1, y: '-50%' }}
              exit={{ opacity: 0, scaleY: 0.5, y: '-50%' }}
              onMouseUp={() => setIsPressed(false)}
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