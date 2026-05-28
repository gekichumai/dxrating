import type { Asset } from '@/assetpack.gen'
import assetpack from '@/utils/assetpack.json'
import { omit } from 'lodash-es'
import type { ImgHTMLAttributes, SourceHTMLAttributes } from 'react'

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

const toCdnUrl = (path: string) => {
  return `https://shama.dxrating.net${path}`
}

export const WebpSupportedImage = (
  props: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad' | 'alt'> & {
    alt: string
    objectFit?: 'contain' | 'cover'
    pictureSources?: SourceHTMLAttributes<HTMLSourceElement>[]
  } & (
      | {
          assetpackKey?: string
        }
      | {
          src?: {
            at1x: Asset
            at2x?: Asset
          }
        }
    ),
) => {
  const source = (() => {
    if ('assetpackKey' in props) {
      const might = assetpack[props.assetpackKey as keyof typeof assetpack] as Asset | undefined
      if (might)
        return {
          at1x: might,
        }
    }
    if ('src' in props) {
      return props.src
    }

    throw new Error('No source provided')
  })()
  if (!source) throw new Error('No source provided')

  const { alt } = props
  const rest = omit(props, ['assetpackKey', 'objectFit', 'src', 'alt', 'pictureSources']) as Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    'src' | 'onLoad' | 'alt'
  >

  const webp = changeToWebp(source.at1x.path)
  const webpSrcSet = source.at2x
    ? `${toCdnUrl(webp)} 1x, ${toCdnUrl(changeToWebp(source.at2x.path))} 2x`
    : toCdnUrl(webp)
  const originalSrcSet = source.at2x
    ? `${toCdnUrl(source.at1x.path)} 1x, ${toCdnUrl(source.at2x.path)} 2x`
    : toCdnUrl(source.at1x.path)

  return (
    <picture>
      {props.pictureSources?.map((sourceProps, index) => (
        <source key={index} {...sourceProps} />
      ))}
      <source type={srcToMimeType(webp)} srcSet={webpSrcSet} />
      <source type={srcToMimeType(source.at1x.path)} srcSet={originalSrcSet} />
      <img
        src={toCdnUrl(source.at1x.path)}
        alt={alt}
        height={source.at1x.height}
        width={source.at1x.width}
        {...rest}
        style={{
          aspectRatio: `${source.at1x.width} / ${source.at1x.height}`,
          objectFit: props.objectFit,
          ...rest.style,
        }}
      />
    </picture>
  )
}