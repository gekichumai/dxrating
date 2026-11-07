import { useNetImportSettings } from './import/NetImportSettingsContext'
import { Button, Divider, Menu } from '@mui/material'
import { type FC, useId, useRef, useState } from 'react'
import { ImportFromAquaDxButtonListItem } from './import/ImportFromAquaDxButtonListItem.tsx'
import { ImportFromAquaSQLiteListItem } from './import/ImportFromAquaSQLiteListItem'
import { ImportFromDivingFishButtonListItem } from './import/ImportFromDivingFishButtonListItem'
import { ImportFromJSONButtonListItem } from './import/ImportFromJSONButtonListItem'
import { ImportFromLxnsButtonListItem } from './import/ImportFromLxnsButtonListItem'
import { ImportFromMuNetButtonListItem } from './import/ImportFromMuNetButtonListItem'
import { ImportFromNETRecordsListItem } from './import/ImportFromNETRecordsListItem'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const ImportMenu: FC<{
  /** The button's label; the saved-records card uses the plain "Import…" */
  label?: string
}> = ({ label }) => {
  const { isOpen: settingsOpen, openSettings } = useNetImportSettings()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)
  const locale = useLocale()
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }

  const id = useId()

  return (
    <>
      <Button
        ref={triggerRef}
        id={`button-${id}`}
        aria-controls={open ? `menu-${id}` : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleClick}
        variant="outlined"
      >
        {label ?? m.ratingCalculator_io_import_button({}, { locale })}
      </Button>

      <Menu
        id={`menu-${id}`}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': `button-${id}`,
          disabledItemsFocusable: true,
        }}
        variant="menu"
        disableRestoreFocus={settingsOpen}
        disableAutoFocusItem
      >
        <ImportFromNETRecordsListItem
          onSelect={() => {
            handleClose()
            openSettings(triggerRef.current)
          }}
        />
        <ImportFromDivingFishButtonListItem onClose={handleClose} />
        <ImportFromLxnsButtonListItem onClose={handleClose} />
        <Divider />

        <ImportFromJSONButtonListItem onClose={handleClose} />
        <ImportFromAquaDxButtonListItem onClose={handleClose} />
        <ImportFromMuNetButtonListItem onClose={handleClose} />
        <ImportFromAquaSQLiteListItem onClose={handleClose} />
      </Menu>
    </>
  )
}