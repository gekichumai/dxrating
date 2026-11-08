import { describe, expect, it } from 'vitest'
import { aliasHostLabel, aliasQuestion, toAsciiLabel } from '../aliasQuestion'

describe('toAsciiLabel', () => {
  it.each([
    ['abc-1', 'abc-1'],
    ['bücher', 'xn--bcher-kva'],
    ['ü', 'xn--tda'],
    ['是什么歌', 'xn--6iq3kq43dxve'],
    ['快乐合成器', 'xn--fjq42le4bhxpruc'],
    ['キミシラ', 'xn--nckua3jrb'],
  ])('%s → %s (as the WHATWG URL parser encodes it)', (label, ascii) => {
    expect(toAsciiLabel(label)).toBe(ascii)
    expect(new URL(`https://${label}.com`).hostname).toBe(`${ascii}.com`)
  })
})

describe('aliasHostLabel', () => {
  it.each([
    ['Happy Synthesizer', 'happy-synthesizer'],
    ['  Mr. Wonderland ', 'mr-wonderland'],
    ['a.b.c', 'a-b-c'],
    ['我的 歌（DX）', '我的-歌dx'],
    ['Ｈａｐｐｙ', 'happy'],
    ['what?! song...', 'what-song'],
    ['-- edge --', 'edge'],
    ['快乐断手器', '快乐断手器'],
    ['Re:End', 'reend'],
    ['fate/stay/night', 'fatestaynight'],
    ['a ﾟb', 'a-b'],
    ['❤️love', 'love'],
    ['café', 'café'],
  ])('%s → %s', (alias, label) => {
    expect(aliasHostLabel(alias)).toBe(label)
  })

  it.each(['', '   ', '!!!', '...', '（）', '⚔️🍎', '(ﾟ∀ﾟ)', 'abcאב', 'אב', 'مرحبا 1', 'www', 'WWW', ' www ', 'ｗｗｗ'])(
    'makes no label from %j',
    (alias) => {
      expect(aliasHostLabel(alias)).toBeNull()
    },
  )

  it('makes only labels the URL parser accepts as one label, for every alias shape above', () => {
    for (const alias of [
      'Re:End',
      'fate/stay/night',
      'track 4/3',
      '⚔️🍎',
      '(ﾟ∀ﾟ)',
      'a ﾟb',
      '❤️love',
      'café',
      '我的 歌（DX）',
    ]) {
      const label = aliasHostLabel(alias)
      if (label === null) continue
      expect(new URL(`https://${label}.是什么歌.com`).hostname).toBe(`${toAsciiLabel(label)}.xn--6iq3kq43dxve.com`)
    }
  })

  it('allows 63 bytes and no more', () => {
    expect(aliasHostLabel('a'.repeat(63))).toBe('a'.repeat(63))
    expect(aliasHostLabel('a'.repeat(64))).toBeNull()
    // Short in characters, too long as punycode
    expect(aliasHostLabel('快乐合成器'.repeat(8))).toBe('快乐合成器'.repeat(8)) // xn-- + 59: 63 bytes
    expect(aliasHostLabel('快乐合成器'.repeat(10))).toBeNull()
  })
})

describe('aliasQuestion', () => {
  it('links to the label', () => {
    expect(aliasQuestion('Mr. Wonderland')).toEqual({
      clipboard: 'https://mr-wonderland.是什么歌.com',
      toastContent: 'mr-wonderland.是什么歌.com',
    })
  })

  it('falls back to the question when there is no label', () => {
    const long = ` ${'快乐合成器'.repeat(10)} `
    expect(aliasQuestion(long)).toEqual({
      clipboard: `${long.trim()}是什么歌`,
      toastContent: `${long.trim()}是什么歌`,
    })
    expect(aliasQuestion('!!!').clipboard).toBe('!!!是什么歌')
  })

  it('falls back to the question for www, which the 是什么歌.com Worker serves as its home page', () => {
    expect(aliasQuestion('WWW')).toEqual({ clipboard: 'WWW是什么歌', toastContent: 'WWW是什么歌' })
    // Only the exact label is reserved
    expect(aliasQuestion('www2').clipboard).toBe('https://www2.是什么歌.com')
  })
})