import { describe, expect, it } from 'vitest'
import { compactKey, normalizeText, skeletonKey, wordSuffixes } from './textKeys'

describe('normalizeText', () => {
  it('folds width, case, katakana, diacritics and stylised letters', () => {
    expect(normalizeText('ＣＡＦＥ')).toBe('cafe')
    expect(normalizeText('Café')).toBe('cafe')
    expect(normalizeText('アリキタリ')).toBe('ありきたり')
    expect(normalizeText('FLΛME/FRΦST')).toBe('flame/frost')
    expect(normalizeText('sølips')).toBe('solips')
  })

  it('keeps dakuten on kana', () => {
    expect(normalizeText('ガ')).toBe('が')
  })
})

describe('compactKey', () => {
  it('drops spaces, punctuation and symbols', () => {
    expect(compactKey('Beat Opera op.1')).toBe('beatoperaop1')
    expect(compactKey('ネ！コ！')).toBe('ねこ')
  })
})

describe('skeletonKey', () => {
  it('gives kana and every common romaji spelling the same key', () => {
    const key = skeletonKey('ありきたり')
    expect(skeletonKey('アリキタリ')).toBe(key)
    expect(skeletonKey('arikitari')).toBe(key)
  })

  it('folds Hepburn and Kunrei spellings, long vowels and doubled n', () => {
    expect(skeletonKey('shinjuku')).toBe(skeletonKey('sinzyuku'))
    expect(skeletonKey('tsunagite')).toBe(skeletonKey('tunagite'))
    expect(skeletonKey('toukyou')).toBe(skeletonKey('tokyo'))
    expect(skeletonKey('とうきょう')).toBe(skeletonKey('tokyo'))
    expect(skeletonKey('konnan')).toBe(skeletonKey('こんなん'))
    expect(skeletonKey('チューリング')).toBe(skeletonKey('churingu'))
  })

  it('accepts both spellings of を', () => {
    expect(skeletonKey('mariawohagemase')).toBe(skeletonKey('マリアをはげませ'))
    expect(skeletonKey('mariaohagemase')).toBe(skeletonKey('マリアをはげませ'))
  })

  it('keeps small tsu as a doubled consonant', () => {
    expect(skeletonKey('かった')).toBe(skeletonKey('katta'))
    expect(skeletonKey('マッチ')).toBe(skeletonKey('matchi'))
  })

  it('leaves kanji in place', () => {
    expect(skeletonKey('ありきたりな恋の歌')).toBe('arikitarina恋no歌')
  })
})

describe('wordSuffixes', () => {
  it('lists the compact text from each word start', () => {
    expect(wordSuffixes('the great journey')).toEqual(['thegreatjourney', 'greatjourney', 'journey'])
  })
})