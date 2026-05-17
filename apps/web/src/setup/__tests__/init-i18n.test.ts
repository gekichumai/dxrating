import i18n from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Module } from 'i18next'
import { initI18n } from '../init-i18n'

describe('i18n initialization', () => {
  afterEach(() => {
    delete i18n.services.languageDetector
  })

  it('registers a browser language detector even after universal initialization', () => {
    const detector = {
      type: 'languageDetector',
      init: vi.fn(),
    } satisfies Module & { init: () => void }

    initI18n()
    initI18n(detector, { caches: ['localStorage'] })

    expect(detector.init).toHaveBeenCalled()
    expect(i18n.services.languageDetector).toBe(detector)
  })
})