import type { VersionEnum } from '@gekichumai/dxdata'
import { ListItem, ListSubheader, MenuItem, Select, styled } from '@mui/material'
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

// A glass button rather than MUI's filled grey well: the whole surface is the combobox, so the focus ring (index.css)
// follows its 12px radius (--radius-lg) instead of an accent underline
const StyledSelect = styled(Select<string>)({
  '& .MuiSelect-select.MuiSelect-select': {
    borderRadius: 'inherit',
    padding: '8px 36px 8px 16px',
  },
  // Compact: the same 48px height as the navigation beside it
  '&.version-switcher--compact .MuiSelect-select.MuiSelect-select': {
    paddingBlock: 6,
  },
  '& .MuiSelect-select:focus': {
    backgroundColor: 'transparent',
    borderRadius: 'inherit',
  },
  '& .MuiSelect-icon': {
    right: 8,
    color: 'var(--fg-2)',
  },
})

const SUBHEADER_CLASS_NAME = 'bg-transparent px-3 pt-3 pb-1 text-xs font-semibold leading-normal text-fg-2'

/**
 * The game version and region picker. The full size (a large version logo over the region chip) is for the home page;
 * `compact` puts a small logo beside the chip so inner pages start with their content. Phones in landscape always get
 * the compact layout (index.css).
 */
export const VersionRegionSwitcher: FC<{ compact?: boolean }> = ({ compact = false }) => {
  const selectRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { t } = useTranslation(['settings'])
  const { version, region, setVersionAndRegion } = useAppContext()
  const selectLabel = t('settings:version-and-region.select')
  const currentId = toMergedVersionRegionId(version, region)
  const isListed = [...VERSION_SPECIFIC_REGIONS, ...VERSION_GENERIC_REGIONS].some(({ id }) => id === currentId)

  return (
    <StyledSelect
      ref={selectRef}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      MenuProps={{ transitionDuration: 0, slotProps: { paper: { className: 'max-w-[20rem]' } } }}
      value={toMergedVersionRegionId(version, region)}
      variant="standard"
      disableUnderline
      className={clsx(
        'version-switcher glass-thin [transition-property:background-color] duration-[var(--duration-fast)] hover:bg-white/55',
        compact && 'version-switcher--compact',
      )}
      SelectDisplayProps={{
        'aria-label': selectLabel,
      }}
      inputProps={{
        'aria-label': selectLabel,
      }}
      onChange={(e) => {
        const { version, region } = fromMergedVersionRegionId(e.target.value)
        const origin = wipeOriginFromElement(selectRef.current)
        flushSync(() => setOpen(false))
        void startViewTransition(() => {
          setVersionAndRegion(version, region)
        }, origin)
      }}
      renderValue={(value) => (
        <div className="version-switcher__value flex items-center gap-x-3 gap-y-1.5">
          <WebpSupportedImage
            objectFit="contain"
            src={{ at1x: VERSION_THEME[getVersionEnum(fromMergedVersionRegionId(value).version)].logo }}
            className="version-switcher__logo w-auto touch-callout-none"
            alt={t('settings:version-and-region.logo-alt', {
              version: getVersionEnum(fromMergedVersionRegionId(value).version),
            })}
            fetchPriority="high"
            draggable={false}
          />

          <div className="self-center rounded-full border border-solid border-[var(--glass-border)] bg-accent-subtle px-3 py-1.5 text-center text-sm font-semibold leading-none text-fg-1 whitespace-nowrap">
            {t('settings:region.title', {
              region: t(`settings:region.${fromMergedVersionRegionId(value).region}`),
            })}
          </div>
        </div>
      )}
    >
      {!isListed && (
        <MenuItem value={currentId}>
          {getVersionEnum(version)} · {t(`settings:region.${region}`)}
        </MenuItem>
      )}
      <ListSubheader disableSticky className={SUBHEADER_CLASS_NAME}>
        {t('settings:version-and-region.select')}
      </ListSubheader>
      {VERSION_SPECIFIC_REGIONS.map(({ id, versionEnum, region }) => (
        <MenuItem value={id} key={id} className="flex items-center gap-6">
          <WebpSupportedImage
            objectFit="contain"
            src={{ at1x: VERSION_THEME[versionEnum].logo }}
            className="h-16 touch-callout-none object-contain w-25"
            alt={t('settings:version-and-region.logo-alt', { version: versionEnum })}
            draggable={false}
          />

          <div className="mr-2 flex flex-col items-start">
            <span className="text-sm text-fg-2">{versionEnum}</span>
            <span className="text-base font-semibold text-fg-1">{t(`settings:region.${region}`)}</span>
          </div>
        </MenuItem>
      ))}

      <ListSubheader disableSticky className={clsx(SUBHEADER_CLASS_NAME, 'whitespace-normal')}>
        {t('settings:version-and-region.select-generic')}
      </ListSubheader>
      {uniqBy(VERSION_GENERIC_REGIONS, (versionRegion) => versionRegion.dxVersion).map(({ id, versionEnum }) => (
        <MenuItem value={id} key={id} className="flex items-center gap-4">
          <WebpSupportedImage
            objectFit="contain"
            src={{ at1x: VERSION_THEME[versionEnum].logo }}
            className="h-12 touch-callout-none object-contain w-20"
            alt={t('settings:version-and-region.logo-alt', { version: versionEnum })}
            draggable={false}
          />

          <div className="mr-2 flex flex-col items-start">
            <span className="text-sm text-fg-1">{versionEnum}</span>
            <span className="text-xs text-fg-2">{t('settings:region._generic')}</span>
          </div>
        </MenuItem>
      ))}
      <ListItem className="flex justify-center items-center px-3 pt-2 pb-3 text-xs leading-normal">
        <div className="flex justify-center items-start text-fg-2">
          <MdiInformation aria-hidden className="mr-2 shrink-0 mt-0.5" />
          <span className="whitespace-normal text-pretty">{t('settings:version-and-region.info')}</span>
        </div>
      </ListItem>
    </StyledSelect>
  )
}