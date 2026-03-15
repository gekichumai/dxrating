import { Button, Dialog, Grow, TextField } from '@mui/material'
import { usePostHog } from 'posthog-js/react'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAsyncFn } from 'react-use'
import IconMdiPlus from '~icons/mdi/plus'
import { useAuth } from '../../hooks/useAuth'
import { apiClient as client } from '../../lib/orpc'
import { useServerAliases } from '../../models/useServerAliases'
import type { FlattenedSheet } from '../../songs'
import { formatErrorMessage } from '../../utils/formatErrorMessage'
import { MotionButtonBase } from '../../utils/motion'
import { SheetListItemContent } from './SheetListItem'

export const AddSheetAltNameButton: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const [open, setOpen] = useState(false)
  const { session, openLoginDialog, LoginDialog } = useAuth()
  const posthog = usePostHog()

  const [newAltName, setNewAltName] = useState('')
  const { mutate } = useServerAliases()

  const [{ loading }, handleAddAltName] = useAsyncFn(async () => {
    if (!session) return

    try {
      await client.aliases.create({
        songId: sheet.songId,
        name: newAltName.trim(),
      })

      toast.success(t('sheet:aliases.toast-success', { name: newAltName.trim() }))
      setOpen(false)
      setNewAltName('')
      mutate() // Trigger revalidation
    } catch (e: any) {
      toast.error(t('sheet:aliases.toast-failed', { error: formatErrorMessage(e) }))
    }
  }, [newAltName, sheet.songId, mutate])

  return (
    <>
      <LoginDialog />
      <MotionButtonBase
        className="h-6 border-1 border-solid border-gray-200 rounded-lg inline-flex self-start items-center justify-center px-2 cursor-pointer bg-gray-100 hover:bg-gray-200 hover:border-gray-300 active:bg-gray-300 active:border-gray-400 transition mt-2"
        onClick={() => {
          setOpen(true)
          posthog?.capture('add_sheet_alt_name_button_clicked')
        }}
      >
        <IconMdiPlus className="h-4 w-4" />

        <span className="ml-1 text-xs">{t('sheet:aliases.add-new')}</span>
      </MotionButtonBase>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        TransitionComponent={Grow}
        maxWidth="md"
        classes={{
          paper: 'w-full',
        }}
      >
        <div className="flex flex-col gap-2 p-4 relative w-full">
          <div className="text-lg font-bold">{t('sheet:aliases.dialog-title')}</div>
          <div className="text-lg">
            <SheetListItemContent sheet={sheet} />
          </div>

          <div className="flex flex-col gap-2">
            <TextField
              label={t('sheet:aliases.input-label')}
              variant="outlined"
              value={newAltName}
              onChange={(e) => setNewAltName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddAltName()
                }
              }}
              data-attr="add-alias-input"
            />

            <Button
              variant="contained"
              color="primary"
              onClick={handleAddAltName}
              startIcon={<IconMdiPlus />}
              disabled={newAltName.trim().length === 0 || newAltName.trim().length > 100 || !session || loading}
              type="submit"
            >
              {loading ? t('sheet:aliases.adding') : t('sheet:aliases.add-button')}
            </Button>
          </div>

          {!session && (
            <div
              className="text-gray-500 absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-80 p-8 z-1 cursor-pointer"
              onClick={openLoginDialog}
              onKeyDown={(e) => e.key === 'Enter' && openLoginDialog()}
              role="button"
              tabIndex={0}
            >
              <span className="text-center font-bold text-sm text-zinc-600 underline underline-offset-2">
                {t('sheet:aliases.login-required')}
              </span>
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}