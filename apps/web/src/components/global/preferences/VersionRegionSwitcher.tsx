import type { VersionEnum } from '@gekichumai/dxdata'
import { ListItem, ListSubheader, MenuItem, Select, styled } from '@mui/material'
import clsx from 'clsx'
import uniqBy from 'lodash-es/uniqBy'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import MdiInformation from '~icons/mdi/information'
import { type DXVersion, DXVersionToDXDataVersionEnumMap, type Region } from '../../../models/context/AppContext'
import { useAppContext } from '../../../models/context/useAppContext'
import { startViewTransition } from '../../../utils/startViewTransition'
import { useVersionTheme } from '../../../utils/useVersionTheme'
import { WebpSupportedImage } from '../WebpSupportedImage'

const fromMergedVersionRegionId = (id: string) => {
  const [version, region] = id.split('__') as [DXVersion, Region]
  return { version, region }
}

const toMergedVersionRegionId = (version: DXVersion, region: Region) => `${version}__${region}`

interface VersionRegion {
  id: string
  versionEnum: VersionEnum
  dxVersion: DXVersion
  region: Region
}

const VERSION_SPECIFIC_REGIONS: VersionRegion[] = [
  {
    dxVersion: 'prism-plus' as const,
    region: 'jp' as const,
  },
  {
    dxVersion: 'prism' as const,
    region: 'intl' as const,
  },
  {
    dxVersion: 'prism' as const,
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
    dxVersion: 'prism-plus' as const,
  },
  {
    dxVersion: 'prism' as const,
  },
  {
    dxVersion: 'buddies-plus' as const,
  },
  {
    dxVersion: 'buddies' as const,
  },
].map(({ dxVersion }) => ({
  id: `${dxVersion}__${'_generic'}`,
  versionEnum: DXVersionToDXDataVersionEnumMap[dxVersion],
  dxVersion,
  region: '_generic' as const,
}))

const StyledSelect = styled(Select<string>)(({ theme }) => ({
  '&': {
    borderRadius: 12,
    overflow: 'hidden',
  },
  '& .MuiPaper-root': {
    maxWidth: '19rem',
  },
  '& .MuiSelect-select': {
    padding: theme.spacing(1, 2),
  },
  '&:before': {
    display: 'none',
  },
}))

export const VersionRegionSwitcher: FC = () => {
  const { t } = useTranslation(['settings'])
  const theme = useVersionTheme()
  const { version, region, setVersionAndRegion } = useAppContext()

  return (
    <StyledSelect
      value={toMergedVersionRegionId(version, region)}
      variant="filled"
      onChange={(e) => {
        const { version, region } = fromMergedVersionRegionId(e.target.value)
        startViewTransition(() => {
          setVersionAndRegion(version, region)
        })
      }}
      renderValue={(value) => (
        <div className="flex flex-col gap-0.5">
          <WebpSupportedImage
            src={`https://shama.dxrating.net/images/version-logo/${fromMergedVersionRegionId(value).version}.png`}
            className="h-32 w-auto touch-callout-none"
            draggable={false}
          />

          <div
            className="text-center text-sm tracking-wide font-bold rounded-full leading-none py-1.5 px-3 border border-solid border-zinc-9/10 self-center text-zinc-6"
            style={{
              background: `${theme.accentColor}33`,
            }}
          >
            {t('settings:region.title', {
              region: t(`settings:region.${fromMergedVersionRegionId(value).region}`),
            })}
          </div>
        </div>
      )}
    >
      <ListSubheader className="leading-normal py-4">{t('settings:version-and-region.select')}</ListSubheader>
      {VERSION_SPECIFIC_REGIONS.map(({ id, dxVersion, versionEnum, region }, i) => (
        <MenuItem
          value={id}
          key={id}
          className={clsx('flex items-center gap-8 border-b border-solid border-gray-200', i === 0 && 'border-t')}
        >
          <WebpSupportedImage
            src={`https://shama.dxrating.net/images/version-logo/${dxVersion}.png`}
            className="h-16 touch-callout-none object-contain w-25"
            draggable={false}
          />

          <div className="mr-2 opacity-70 flex flex-col items-start">
            <span>{versionEnum}</span>
            <span className="uppercase font-bold text-lg">{t(`settings:region.${region}`)}</span>
          </div>
        </MenuItem>
      ))}

      <ListSubheader className="leading-normal py-4">{t('settings:version-and-region.select-generic')}</ListSubheader>
      {uniqBy(VERSION_GENERIC_REGIONS, (versionRegion) => versionRegion.dxVersion).map(
        ({ id, dxVersion, versionEnum }, i) => (
          <MenuItem
            value={id}
            key={id}
            className={clsx('flex items-center gap-4 border-b border-solid border-gray-200', i === 0 && 'border-t')}
          >
            <WebpSupportedImage
              src={`https://shama.dxrating.net/images/version-logo/${dxVersion}.png`}
              className="h-12 touch-callout-none object-contain w-20"
              draggable={false}
            />

            <div className="mr-2 opacity-70 flex flex-col items-start">
              <span>{versionEnum}</span>
              <span className="uppercase text-xs">{t('settings:region._generic')}</span>
            </div>
          </MenuItem>
        ),
      )}
      <ListItem className="flex justify-center items-center text-sm">
        <div className="flex justify-center items-start max-w-[22rem] text-zinc-500">
          <MdiInformation className="mr-2 shrink-0 mt-0.5" />
          <span className="whitespace-normal">{t('settings:version-and-region.info')}</span>
        </div>
      </ListItem>
    </StyledSelect>
  )
}
