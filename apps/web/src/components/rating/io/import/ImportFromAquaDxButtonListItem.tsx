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
        input.onchange = (event) => {
          const element = event.target as HTMLInputElement
          if (!element) return

          const file = element?.files ? element?.files[0] : undefined
          if (!file) return

          const reader = new FileReader()
          reader.onload = async (event) => {
            const data = event.target?.result
            if (!data) return
            if (typeof data !== 'string') return

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
            haptic.trigger('success')
            toast.success(t('rating-calculator:io.import.aqua-dx.success', { count: entries.length }))
          }
          reader.readAsText(file)
        }
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