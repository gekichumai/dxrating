import { describe, expect, it } from 'vitest'
import {
  finishServerTimingSpan,
  formatServerTimingHeader,
  setServerTimingHeader,
  startServerTimingSpan,
} from '../server-timing'

describe('server timing', () => {
  it('formats coarse SSR spans for the Server-Timing header', () => {
    const setupSpan = startServerTimingSpan('ssr_setup', 10)
    const renderSpan = startServerTimingSpan('ssr', 5)

    expect(
      formatServerTimingHeader([finishServerTimingSpan(setupSpan, 12.34), finishServerTimingSpan(renderSpan, 18.98)]),
    ).toBe('ssr_setup;dur=2.3, ssr;dur=14.0')
  })

  it('appends timing metrics without replacing an existing Server-Timing header', () => {
    const headers = new Headers({ 'Server-Timing': 'cache;dur=1.0' })

    setServerTimingHeader(headers, [{ name: 'ssr', duration: 10.04 }])

    expect(headers.get('Server-Timing')).toBe('cache;dur=1.0, ssr;dur=10.0')
  })
})