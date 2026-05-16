import { describe, expect, it } from 'vitest'
import { normalizeDetectedLanguage } from '../init-client'

describe('client initialization', () => {
  it('normalizes Chinese browser locales to supported script variants', () => {
    expect(normalizeDetectedLanguage('zh-CN')).toBe('zh-Hans')
    expect(normalizeDetectedLanguage('zh-SG')).toBe('zh-Hans')
    expect(normalizeDetectedLanguage('zh-TW')).toBe('zh-Hant')
    expect(normalizeDetectedLanguage('zh-HK')).toBe('zh-Hant')
    expect(normalizeDetectedLanguage('zh-MO')).toBe('zh-Hant')
  })
})