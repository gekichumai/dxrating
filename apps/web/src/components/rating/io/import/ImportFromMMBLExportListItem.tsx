import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import MdiClipboardText from '~icons/mdi/clipboard-text'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import type { ListActions } from 'react-use/lib/useList'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

const EXPECTED_HEADER = 'Song\tGenre\tVersion\tChart\tDifficulty\tLevel\tAchv\tRank\tFC/AP\tSync\tDX ✦\tDX %'

export const ImportFromMMBLExportListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const parseAchievement = (achievement: string): number => {
    const value = parseFloat(achievement.replace('%', ''))
    return isNaN(value) ? 0 : value / 100
  }

  return (
    <MenuItem
      onClick={async () => {
        onClose()
        
        try {
          const text = await navigator.clipboard.readText()
          if (!text) {
            toast.error('No data in clipboard')
            return
          }

          const lines = text.trim().split('\n')
          
          // Validate header line
          if (!lines[0] || lines[0].trim() !== EXPECTED_HEADER) {
            toast.error('Invalid MMBL export format')
            return
          }

          const musicIdMapJson = await import('@/assets/music-id-map.json')
          const musicIdMap: { [key: string]: { name: string; ver: string } } =
            musicIdMapJson.default

          const entries: PlayEntry[] = []
          
          // Process data rows
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split('\t')
            if (row.length !== 12) {
              toast.error('Invalid line found in MMBL export')
              continue
            }

            const [songName, , , chartType, difficulty, , achievement] = row
            
            // Skip if missing required fields
            if (!songName || !chartType || !difficulty || !achievement) {
              toast.error('Invalid line found in MMBL export')
              continue
            }

            // Find song in music ID map
            const songEntry = Object.entries(musicIdMap).find(
              ([, song]) => song.name === songName
            )

            if (!songEntry) continue

            const type = chartType === 'DX' ? '__dxrt__dx__dxrt__' : '__dxrt__std__dxrt__'
            const sheetId = `${songName}${type}${difficulty.toLowerCase()}`
            
            entries.push({
              sheetId,
              achievementRate: parseAchievement(achievement)
            })
          }

          modifyEntries.set(entries)
          toast.success(`Imported ${entries.length} entries`)
        } catch (error) {
          toast.error(`Failed to import: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }}
    >
      <ListItemIcon>
        <MdiClipboardText />
      </ListItemIcon>
      <ListItemText>Import from MMBL exported data (clipboard)...</ListItemText>
    </MenuItem>
  )
}