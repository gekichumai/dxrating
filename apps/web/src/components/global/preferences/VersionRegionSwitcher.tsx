import type { VersionEnum } from '@gekichumai/dxdata'
import clsx from 'clsx'
import uniqBy from 'lodash-es/uniqBy'
import { type FC, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import MdiInformation from '~icons/mdi/information'
import {
  type DXVersion,
  DXVersionToDXDataVersionEnumMap,
  LATEST_REGION_VERSIONS,
  type Region,
} from '../../../models/context/AppContext'
import { useAppContext } from '../../../models/context/useAppContext'
import { startViewTransition, wipeOriginFromElement } from '../../../utils/startViewTransition'
import { VERSION_THEME } from '../../../theme'
import { VersionPicker, type VersionPickerOption, VersionPickerTrigger } from '../../version/VersionPicker'
import { WebpSupportedImage } from '../WebpSupportedImage'

const fromMergedVersionRegionId = (id: string) => {
  const [version, region] = id.split('__') as [DXVersion, Region]
  return { version, region }
}

const toMergedVersionRegionId = (version: DXVersion, region: Region) => `${version}__${region}`

const getVersionEnum = (version: DXVersion) => DXVersionToDXDataVersionEnumMap[version]

interface VersionRegion {
  id: string
  versionEnum: VersionEnum
  dxVersion: DXVersion
  region: Region
}

const VERSION_SPECIFIC_REGIONS: VersionRegion[] = [
  {
    dxVersion: LATEST_REGION_VERSIONS.jp,
    region: 'jp' as const,
  },
  {
    dxVersion: LATEST_REGION_VERSIONS.intl,
    region: 'intl' as const,
  },
  {
    dxVersion: LATEST_REGION_VERSIONS.cn,
    region: 'cn' as const,
  },
].map(({ dxVersion, region }) => ({
  id: `${dxVersion}__${region}`,
  versionEnum: DXVersionToDXDataVersionEnumMap[dxVersion],
  dxVersion,
  region,
}))

const VERSION_GENERIC_REGIONS: VersionRegion[] = [
  {
    dxVersion: 'magical' as const,
  },
  {
    dxVersion: 'circle-plus' as const,
  },
  {
    dxVersion: 'circle' as const,
  },
  {
    dxVersion: 'prism-plus' as const,
  },
  {
    dxVersion: 'prism' as const,
  },
].map(({ dxVersion }) => ({
  id: `${dxVersion}__${'_generic'}`,
  versionEnum: DXVersionToDXDataVersionEnumMap[dxVersion],
  dxVersion,
  region: '_generic' as const,
}))

/**
 * The game version and region picker. The full size (a large version logo over the region chip) is for the home page;
 * `compact` puts a small logo beside the chip so inner pages start with their content. Phones in landscape always get
 * the compact layout (index.css). It opens the shared version picker: the latest release of each region first, then
 * every version in base | PLUS pairs for the "Generic" region.
 */
export const VersionRegionSwitcher: FC<{ compact?: boolean }> = ({ compact = false }) => {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { t } = useTranslation(['settings'])
  const { version, region, setVersionAndRegion } = useAppContext()
  const selectLabel = t('settings:version-and-region.select')
  const currentId = toMergedVersionRegionId(version, region)
  const currentVersion = getVersionEnum(version)
  const isListed = [...VERSION_SPECIFIC_REGIONS, ...VERSION_GENERIC_REGIONS].some(({ id }) => id === currentId)

  const toOption = ({ id, versionEnum, region }: VersionRegion): VersionPickerOption => ({
    key: id,
    version: versionEnum,
    selected: id === currentId,
    // The paired versions are all "Generic", which their heading says once
    description: region === '_generic' ? undefined : t(`settings:region.${region}`),
  })
  // A saved choice the list no longer offers (an older regional release) stays visible, and selected, at the front
  const featured = [
    ...(isListed ? [] : [{ id: currentId, versionEnum: currentVersion, dxVersion: version, region }]),
    ...VERSION_SPECIFIC_REGIONS,
  ].map(toOption)
  const generic = uniqBy(VERSION_GENERIC_REGIONS, (versionRegion) => versionRegion.dxVersion).map(toOption)

  const pick = (option: VersionPickerOption) => {
    const next = fromMergedVersionRegionId(option.key)
    const origin = wipeOriginFromElement(triggerRef.current)
    flushSync(() => setOpen(false))
    if (option.key === currentId) return
    void startViewTransition(() => {
      setVersionAndRegion(next.version, next.region)
    }, origin)
  }

  return (
    <>
      <VersionPickerTrigger
        ref={triggerRef}
        expanded={open}
        aria-label={`${selectLabel}: ${currentVersion} · ${t(`settings:region.${region}`)}`}
        onClick={() => setOpen(true)}
        className={clsx(
          'version-switcher glass-thin ps-4 pe-2 py-2 [transition-property:background-color] duration-[var(--duration-fast)] hover:bg-white/55',
          compact && 'version-switcher--compact !py-1.5',
        )}
      >
        <span className="version-switcher__value flex items-center gap-x-3 gap-y-1.5">
          <WebpSupportedImage
            objectFit="contain"
            src={{ at1x: VERSION_THEME[currentVersion].logo }}
            className="version-switcher__logo w-auto touch-callout-none"
            alt={t('settings:version-and-region.logo-alt', { version: currentVersion })}
            fetchPriority="high"
            draggable={false}
          />

          <span className="self-center rounded-full border border-solid border-[var(--glass-border)] bg-accent-subtle px-3 py-1.5 text-center text-sm font-semibold leading-none text-fg-1 whitespace-nowrap">
            {t('settings:region.title', { region: t(`settings:region.${region}`) })}
          </span>
        </span>
      </VersionPickerTrigger>

      <VersionPicker
        open={open}
        onClose={() => setOpen(false)}
        title={selectLabel}
        featured={{ title: t('settings:version-and-region.regional'), options: featured }}
        pagesTitle={t('settings:version-and-region.select-generic')}
        options={generic}
        onPick={pick}
        footnote={
          <p className="m-0 flex items-start gap-2 text-xs leading-normal text-fg-2">
            <MdiInformation aria-hidden className="mt-0.5 shrink-0" />
            <span className="text-pretty">{t('settings:version-and-region.info')}</span>
          </p>
        }
      />
    </>
  )
}