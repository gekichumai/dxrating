import clsx from 'clsx'
import { motion } from 'framer-motion'
import { type FC, type ImgHTMLAttributes, memo, useState } from 'react'
import MdiImageRemove from '~icons/mdi/image-remove'

export const FadedImage: FC<
  Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> & {
    alt: string
    placeholderClassName?: string
  }
> = memo(({ placeholderClassName, draggable, alt, ...props }) => {
  const [isError, setIsError] = useState(false)

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
          alt={alt}
          onError={(event) => {
            setIsError(true)
            props.onError?.(event)
          }}
          className={clsx(
            // Native image painting also works when load fires before hydration.
            'h-full w-full',
            !draggable && 'select-none touch-callout-none',
          )}
          draggable={draggable}
        />
      )}
    </div>
  )
})