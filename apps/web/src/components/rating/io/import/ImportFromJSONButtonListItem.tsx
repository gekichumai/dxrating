import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import IconMdiFile from '~icons/mdi/file'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import type { ListActions } from 'react-use/lib/useList'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

export const ImportFromJSONButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
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
          reader.onload = (event) => {
            const data = event.target?.result
            if (!data) return
            if (typeof data !== 'string') return

            const entries = JSON.parse(data)
            // basic validation
            if (
              !Array.isArray(entries) ||
              !entries.length ||
              !entries[0].sheetId ||
              entries[0].achievementRate === undefined
            ) {
              toast.error('Invalid file format')
              return
            }

            modifyEntries.set(entries)

            toast.success(`Imported ${entries.length} entries`)
          }
          reader.readAsText(file)
        }
        input.click()
      }}
    >
      <ListItemIcon>
        <IconMdiFile />
      </ListItemIcon>
      <ListItemText>
        Import from <code>dxrating</code> Exported JSON...
      </ListItemText>
    </MenuItem>
  )
}
