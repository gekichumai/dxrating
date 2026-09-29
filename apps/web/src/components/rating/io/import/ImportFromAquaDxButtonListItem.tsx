import { getDxdataSongCatalog, normalizeAquaDxRows, type ProviderMusicIdMap } from '@gekichumai/maimai-domain'
import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import MdiEarthArrowDown from '~icons/mdi/earth-arrow-down'
import { useWebHaptics } from 'web-haptics/react'
import { useAppContextDXDataVersion } from '../../../../models/context/useAppContext'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'
import { importResultToPlayEntries } from './importResultToPlayEntries'
import { createRatingImportTracker } from '@/lib/analytics'

type AquaDxExportMusicDetail = {
  musicId: string | number
  level: number
  achievement: number
}

export const ImportFromAquaDxButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const haptic = useWebHaptics()
  const appVersion = useAppContextDXDataVersion()

  return (
    <MenuItem
      onClick={() => {
        onClose()

        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'application/json'
        input.addEventListener(
          'change',
          (event) => {
            const element = event.target
            if (!(element instanceof HTMLInputElement)) return

            const file = element?.files !== null ? element?.files[0] : undefined
            if (file === undefined) return

            const reader = new FileReader()
            reader.addEventListener(
              'load',
              async (event) => {
                const data = event.target?.result
                if (data === null || data === undefined || data === '') return
                if (typeof data !== 'string') return

                const analytics = createRatingImportTracker('aqua_dx')
                try {
                  const musicIdMapJson = await import('@/assets/music-id-map.json')
                  const musicIdMap = musicIdMapJson.default as ProviderMusicIdMap

                  const aquaExportData = JSON.parse(data)
                  const rows = Array.isArray(aquaExportData?.userMusicDetailList)
                    ? aquaExportData.userMusicDetailList.map((musicDetail: AquaDxExportMusicDetail) => ({
                        musicId: musicDetail.musicId,
                        level: musicDetail.level,
                        achievement: musicDetail.achievement,
                      }))
                    : []
                  const importResult = normalizeAquaDxRows(getDxdataSongCatalog(appVersion), rows, musicIdMap)
                  const entries = importResultToPlayEntries(importResult)
                  for (const warning of importResult.warnings) {
                    console.warn('[ImportFromAquaDxButtonListItem]', warning.message, warning.row)
                  }

                  modifyEntries.set(entries)
                  analytics.succeeded(entries.length, importResult.warnings.length)
                  void haptic
                    .trigger('success')
                    ?.catch((error: unknown) => console.warn('Haptic feedback failed', error))
                  toast.success(t('rating-calculator:io.import.aqua-dx.success', { count: entries.length }))
                } catch (error) {
                  analytics.failed('invalid_file')
                  console.error(error)
                }
              },
              { once: true },
            )
            reader.readAsText(file)
          },
          { once: true },
        )
        input.click()
      }}
    >
      <ListItemIcon>
        <MdiEarthArrowDown />
      </ListItemIcon>
      <ListItemText>{t('rating-calculator:io.import.aqua-dx.title')}</ListItemText>
    </MenuItem>
  )
}