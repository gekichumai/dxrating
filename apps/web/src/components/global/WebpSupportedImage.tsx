import { ImgHTMLAttributes } from 'react'

const changeToWebp = (src: string) => {
  const lastDotIndex = src.lastIndexOf('.')
  return `${src.slice(0, lastDotIndex)}.webp`
}

const srcToMimeType = (src: string) => {
  const lastDotIndex = src.lastIndexOf('.')
  const ext = src.slice(lastDotIndex + 1)
  return {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }[ext]
}

export const WebpSupportedImage = ({
  src,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src:
    | string
    | {
        at1x: string
        at2x?: string
      }
}) => {
  const dpr = window.devicePixelRatio
  const at1xSrc = typeof src === 'string' ? src : src.at1x
  if (dpr > 1 && typeof src === 'object' && src.at2x) {
    const webp = changeToWebp(src.at2x)
    const other = src.at2x
    return (
      <picture>
        <source type={srcToMimeType(webp)} srcSet={webp} />
        <source type={srcToMimeType(other)} srcSet={other} />
        <img src={other} {...rest} />
      </picture>
    )
  }

  const webp = changeToWebp(at1xSrc)
  const other = at1xSrc

  return (
    <picture>
      <source type={srcToMimeType(webp)} srcSet={webp} />
      <source type={srcToMimeType(other)} srcSet={other} />
      <img src={other} {...rest} />
    </picture>
  )
}
