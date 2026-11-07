import { describe, expect, it } from 'vitest'
import { createEvalSearch } from '../search-eval/evaluate'

describe('sheet search ranking on the catalog snapshot', () => {
  const { search } = createEvalSearch()
  const topTitles = (query: string, count = 3) =>
    [...new Set(search(query).map((sheet) => sheet.title))].slice(0, count)

  it('puts a word-prefix match ahead of spelling-folded matches', () => {
    expect(topTitles('gla')[0]).toBe('Daredevil Glaive')
  })

  it('puts a title word ahead of fuzzy matches', () => {
    expect(topTitles('great', 2)).toEqual(expect.arrayContaining(['The Great Journey', 'The Great Banquet']))
  })

  it('finds kana titles from romaji and from the other kana script', () => {
    expect(topTitles('arikitari')[0]).toBe('ありきたりな恋の歌')
    expect(topTitles('アリキタリ')[0]).toBe('ありきたりな恋の歌')
    expect(topTitles('neko')[0]).toBe('ネ！コ！')
  })

  it('finds a kana title typed with "wo" for を', () => {
    expect(topTitles('mariawohagemase')[0]).toBe('マリアをはげませ')
  })

  it('finds kana titles from less common romaji spellings', () => {
    expect(topTitles('chiccha')[0]).toBe('ちっちゃな私')
    expect(topTitles('puranetariumurevyuu')[0]).toBe('プラネタリウム・レヴュー')
  })

  it('keeps fuzzy matches even when many songs match by name', () => {
    expect(search('night').map((sheet) => sheet.title)).toContain('AMAZING MIGHTYYYY!!!!')
  })

  it('puts the exact title first', () => {
    expect(topTitles('Link', 1)).toEqual(['Link'])
    expect(topTitles('系ぎて', 1)).toEqual(['系ぎて'])
  })

  it('finds kanji titles from their reading in kana and romaji', () => {
    expect(topTitles('きみのしらないものがたり', 1)).toEqual(['君の知らない物語'])
    expect(topTitles('kiminoshiranaimonogatari', 1)).toEqual(['君の知らない物語'])
  })

  it('puts a latin title prefix ahead of a romaji reading', () => {
    expect(topTitles('shoo', 1)).toEqual(['Shooting Stars'])
    expect(topTitles('しょう')).toContain('唱')
  })

  it('puts a literal artist match ahead of one only in another spelling', () => {
    expect(topTitles('lumo', 1)).toEqual(['デンパラダイム'])
  })
})