import { Button, Dialog, Grow, TextField } from '@mui/material'
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
import { captureAnalyticsEvent } from '@/lib/analytics'

export const AddSheetAltNameButton: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet', 'auth'])
  const [open, setOpen] = useState(false)
  const { session, openLoginDialog, LoginDialog } = useAuth()

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
      captureAnalyticsEvent('sheet_alias_created', {
        song_id: sheet.songId,
        sheet_type: sheet.type,
        sheet_difficulty: sheet.difficulty,
      })
      setOpen(false)
      setNewAltName('')
      mutate() // Trigger revalidation
    } catch (e: any) {
      captureAnalyticsEvent('sheet_alias_failed', {
        song_id: sheet.songId,
        sheet_type: sheet.type,
        sheet_difficulty: sheet.difficulty,
        error_code: 'request_failed',
      })
      toast.error(t('sheet:aliases.toast-failed', { error: formatErrorMessage(e) }))
    }
  }, [newAltName, sheet.songId, mutate])

  return (
    <>
      <LoginDialog />
      <MotionButtonBase
        className="h-6 glass-inset inline-flex self-start items-center justify-center gap-1 px-2 cursor-pointer text-fg-1 hover:bg-white/80 active:bg-black/6 transition-colors duration-150 mt-2"
        onClick={() => {
          setOpen(true)
          captureAnalyticsEvent('add_sheet_alt_name_button_clicked', {
            song_id: sheet.songId,
            sheet_type: sheet.type,
            sheet_difficulty: sheet.difficulty,
          })
        }}
      >
        <IconMdiPlus aria-hidden="true" className="h-4 w-4" />

        <span className="text-xs font-semibold">{t('sheet:aliases.add-new')}</span>
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
        <div className="flex flex-col gap-2 p-4 w-full">
          <h2 className="m-0 text-lg font-semibold">{t('sheet:aliases.dialog-title')}</h2>
          <div className="text-lg">
            <SheetListItemContent sheet={sheet} />
          </div>

          {session ? (
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
                disabled={newAltName.trim().length === 0 || newAltName.trim().length > 100 || loading}
                type="submit"
              >
                {loading ? t('sheet:aliases.adding') : t('sheet:aliases.add-button')}
              </Button>
            </div>
          ) : (
            // Signed out: say why and offer the one action, instead of a disabled form under an overlay
            <div className="flex flex-col items-start gap-2">
              <p className="m-0 text-sm text-fg-2">{t('sheet:aliases.login-required')}</p>
              <Button variant="contained" onClick={openLoginDialog}>
                {t('auth:login.label')}
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}