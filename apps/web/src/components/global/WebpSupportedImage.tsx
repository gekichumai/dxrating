import type { Asset } from '@/assetpack.gen'
import assetpack from '@/utils/assetpack.json'
import { omit } from 'lodash-es'
import type { ImgHTMLAttributes } from 'react'

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
  props: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad'> & {
    objectFit?: 'contain' | 'cover'
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

  const rest = omit(props, ['assetpackKey', 'src']) as Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad'>

  const dpr = window.devicePixelRatio
  if (dpr > 1 && source.at2x) {
    const webp = changeToWebp(source.at2x.path)
    return (
      <picture>
        <source type={srcToMimeType(webp)} srcSet={toCdnUrl(webp)} />
        <source type={srcToMimeType(source.at2x.path)} srcSet={toCdnUrl(source.at2x.path)} />
        <img
          src={toCdnUrl(source.at2x.path)}
          height={source.at2x.height}
          width={source.at2x.width}
          {...rest}
          style={{
            aspectRatio: `${source.at2x.width} / ${source.at2x.height}`,
            objectFit: props.objectFit,
            ...rest.style,
          }}
        />
      </picture>
    )
  }

  const webp = changeToWebp(source.at1x.path)

  return (
    <picture>
      <source type={srcToMimeType(webp)} srcSet={toCdnUrl(webp)} />
      <source type={srcToMimeType(source.at1x.path)} srcSet={toCdnUrl(source.at1x.path)} />
      <img
        src={toCdnUrl(source.at1x.path)}
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
