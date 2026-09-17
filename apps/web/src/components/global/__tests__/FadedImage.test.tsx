import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FadedImage } from '../FadedImage'

afterEach(cleanup)

describe('FadedImage', () => {
  it('keeps an already loaded SSR image visible when hydration misses its load event', async () => {
    const container = document.createElement('div')
    const styles = document.createElement('style')
    styles.textContent = '.opacity-0 { opacity: 0 }'
    document.head.append(styles)
    container.innerHTML = renderToString(<FadedImage src="/cover.jpg" alt="Cover" />)
    document.body.append(container)
    const image = container.querySelector('img')!
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 190 },
    })
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, <FadedImage src="/cover.jpg" alt="Cover" />)
      })
      expect(container.querySelector('img')).toBe(image)
      expect(getComputedStyle(image).opacity).not.toBe('0')
    } finally {
      await act(async () => root?.unmount())
      container.remove()
      styles.remove()
    }
  })

  it('does not hide cached covers on virtualized remounts', () => {
    const first = render(<FadedImage src="/cover.jpg" alt="Cover" />)
    fireEvent.load(first.getByAltText('Cover'))
    first.unmount()
    const second = render(<FadedImage src="/cover.jpg" alt="Cover" />)
    expect(second.getByAltText('Cover').className).not.toContain('opacity-0')
  })

  it('preserves load callbacks and the error fallback', () => {
    const onLoad = vi.fn()
    const onError = vi.fn()
    const view = render(<FadedImage src="/cover.jpg" alt="Cover" onLoad={onLoad} onError={onError} />)
    fireEvent.load(view.getByAltText('Cover'))
    expect(onLoad).toHaveBeenCalledOnce()
    fireEvent.error(view.getByAltText('Cover'))
    expect(onError).toHaveBeenCalledOnce()
    expect(view.queryByAltText('Cover')).toBeNull()
    expect(view.container.querySelector('svg')).not.toBeNull()
  })
})