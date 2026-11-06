import { VERSION_IDS, VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { pairVersions, pairVersionsByEra, versionEraOf, versionLogoSrc } from '../versionEras'

describe('pairVersions', () => {
  it('puts every PLUS on the right of its base version, newest first', () => {
    const pairs = pairVersionsByEra(VERSION_IDS, 'dx')
    expect(pairs[0]).toEqual({ key: 'MAGiCAL', base: VersionEnum.MAGiCAL, plus: null })
    expect(pairs[1]).toEqual({ key: 'CiRCLE', base: VersionEnum.CiRCLE, plus: VersionEnum.CiRCLEPLUS })
    expect(pairs.at(-1)).toEqual({
      key: 'maimaiでらっくす',
      base: VersionEnum.Maimaiでらっくす,
      plus: VersionEnum.MaimaiでらっくすPLUS,
    })
    for (const pair of pairs) {
      if (pair.plus) expect(pair.plus).toBe(`${pair.base} PLUS`)
    }
  })

  it('splits the classic cabinets from the でらっくす era', () => {
    const classic = pairVersionsByEra(VERSION_IDS, 'classic')
    expect(classic.map((pair) => pair.key)).toEqual(['FiNALE', 'MiLK', 'MURASAKi', 'PiNK', 'ORANGE', 'GreeN', 'maimai'])
    expect(classic[0].plus).toBeNull()
    expect(versionEraOf(VersionEnum.FiNALE)).toBe('classic')
    expect(versionEraOf(VersionEnum.Maimaiでらっくす)).toBe('dx')
  })

  it('keeps a PLUS on the right when its base is not listed', () => {
    expect(pairVersions([VersionEnum.PRiSMPLUS])).toEqual([{ key: 'PRiSM', base: null, plus: VersionEnum.PRiSMPLUS }])
  })
})

describe('versionLogoSrc', () => {
  it('uses our asset host for the でらっくす era and text for the classic cabinets', () => {
    expect(versionLogoSrc(VersionEnum.BUDDiESPLUS)).toBe(
      'https://shama.dxrating.net/images/version-title/buddies-plus.png',
    )
    expect(versionLogoSrc(VersionEnum.MAGiCAL)).toBe('/images/versions/magical/logo.webp')
    expect(versionLogoSrc(VersionEnum.MiLK)).toBeNull()
  })
})