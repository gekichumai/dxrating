import { VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { LATEST_REGION_VERSIONS, resolveBest50Bucket } from '../../index.ts'

describe('LATEST_REGION_VERSIONS', () => {
  it('is JP MAGiCAL, international CiRCLE PLUS and CN PRiSM PLUS', () => {
    expect(LATEST_REGION_VERSIONS).toEqual({
      jp: VersionEnum.MAGiCAL,
      intl: VersionEnum.CiRCLEPLUS,
      cn: VersionEnum.PRiSMPLUS,
    })
  })
})

describe('B15/B35 split at each region’s latest version', () => {
  // Since CiRCLE, B15 is the current version and the one before it
  const cases = [
    {
      region: 'jp',
      b15: [VersionEnum.MAGiCAL, VersionEnum.CiRCLEPLUS],
      b35: [VersionEnum.CiRCLE, VersionEnum.PRiSMPLUS, VersionEnum.Maimai],
    },
    {
      region: 'intl',
      b15: [VersionEnum.CiRCLEPLUS, VersionEnum.CiRCLE, VersionEnum.MAGiCAL],
      b35: [VersionEnum.PRiSMPLUS, VersionEnum.PRiSM, VersionEnum.Maimai],
    },
    {
      // PRiSM PLUS predates the CiRCLE rule: only PRiSM PLUS is new, plus charts CN got from newer Japanese versions
      region: 'cn',
      b15: [VersionEnum.PRiSMPLUS, VersionEnum.CiRCLE, VersionEnum.MAGiCAL],
      b35: [VersionEnum.PRiSM, VersionEnum.BUDDiESPLUS, VersionEnum.Maimai],
    },
  ] as const

  for (const { region, b15, b35 } of cases) {
    const latest = LATEST_REGION_VERSIONS[region]
    it(`${region}: ${latest}`, () => {
      for (const version of b15) expect(resolveBest50Bucket(version, latest, region), version).toBe('b15')
      for (const version of b35) expect(resolveBest50Bucket(version, latest, region), version).toBe('b35')
    })
  }

  it('JP still leaves a chart newer than the chosen version out of both buckets', () => {
    expect(resolveBest50Bucket(VersionEnum.MAGiCAL, VersionEnum.PRiSMPLUS, 'jp')).toBeNull()
  })
})