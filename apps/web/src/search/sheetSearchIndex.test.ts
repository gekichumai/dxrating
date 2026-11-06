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

  it('keeps fuzzy matches even when many songs match by name', () => {
    expect(search('night').map((sheet) => sheet.title)).toContain('AMAZING MIGHTYYYY!!!!')
  })

  it('puts the exact title first', () => {
    expect(topTitles('Link', 1)).toEqual(['Link'])
    expect(topTitles('系ぎて', 1)).toEqual(['系ぎて'])
  })
})