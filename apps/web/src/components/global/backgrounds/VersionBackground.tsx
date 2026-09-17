import { useVersionTheme } from '@/utils/useVersionTheme'
import { WebpSupportedImage } from '../WebpSupportedImage'
import { MagicalBackground } from './MagicalBackground'

export function VersionBackground() {
  const { background } = useVersionTheme()
  if (background.kind === 'magical') return <MagicalBackground />

  return (
    <WebpSupportedImage
      src={background}
      alt=""
      aria-hidden={true}
      className="fixed inset-0 h-full-lvh w-full z-[-1] object-cover object-center select-none touch-callout-none"
      draggable={false}
    />
  )
}