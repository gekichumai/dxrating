import { VersionEnum } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import { VERSION_PAGE_VERSIONS, buildVersionPage, parseVersionSlug, versionPagePath } from '../versionPages'

describe('version page slugs', () => {
  it('uses the dxdata version slugs, newest first', () => {
    expect(VERSION_PAGE_VERSIONS[0]).toBe(VersionEnum.MAGiCAL)
    expect(versionPagePath(VersionEnum.CiRCLEPLUS)).toBe('/versions/circle-plus')
    expect(parseVersionSlug('CIRCLE-PLUS')).toBe(VersionEnum.CiRCLEPLUS)
    expect(parseVersionSlug('nope')).toBeNull()
  })
})

describe('buildVersionPage', () => {
  it('lists the charts added in a version, newest release date first', () => {
    const page = buildVersionPage(catalogSnapshot, VersionEnum.CiRCLE)

    expect(page.songCount).toBeGreaterThan(20)
    const dates = page.groups.map((group) => group.releaseDate ?? '')
    expect(dates).toEqual([...dates].sort().reverse())
    for (const row of page.groups.flatMap((group) => group.rows)) {
      expect(['dx', 'std']).toContain(row.type)
      expect(row.href).toMatch(/^\/songs\/dsng_/)
      expect(row.charts.length).toBeGreaterThan(0)
    }
  })
})