import clsx from 'clsx'
import { motion } from 'framer-motion'
import { type FC, type ImgHTMLAttributes, memo, useRef, useState } from 'react'
import MdiImageRemove from '~icons/mdi/image-remove'

export const FadedImage: FC<
  ImgHTMLAttributes<HTMLImageElement> & {
    placeholderClassName?: string
  }
> = memo(({ placeholderClassName, draggable, ...props }) => {
  const [loaded, setLoaded] = useState(false)
  const [isError, setIsError] = useState(false)
  const [instantlyLoaded, setInstantlyLoaded] = useState(false)
  const firstMountAt = useRef(Date.now())
  const onLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true)
    props.onLoad?.(event)

    if (Date.now() - firstMountAt.current < (1 / 60) * 1000) {
      // 1 frame at 60fps
      setInstantlyLoaded(true)
    }
  }

  return (
    <div className={clsx('relative', props.className, placeholderClassName)}>
      {isError ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={clsx(
            'flex items-center justify-center transition-opacity h-full w-full opacity-100',
            !draggable && 'select-none touch-callout-none',
            'duration-200',
          )}
        >
          <MdiImageRemove className="text-zinc-400 text-2xl" />
        </motion.div>
      ) : (
        <img
          {...props}
          onLoad={onLoad}
          onError={() => setIsError(true)}
          className={clsx(
            'transition-opacity h-full w-full',
            loaded ? 'opacity-100' : 'opacity-0',
            !draggable && 'select-none touch-callout-none',
            instantlyLoaded ? 'duration-0' : 'duration-200',
          )}
          draggable={draggable}
        />
      )}
    </div>
  )
})