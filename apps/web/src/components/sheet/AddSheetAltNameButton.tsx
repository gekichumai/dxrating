import { Button, Dialog, Grow, TextField } from '@mui/material'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useAsyncFn } from 'react-use'
import IconMdiPlus from '~icons/mdi/plus'
import { useAuth } from '../../hooks/useAuth'
import { apiClient as client } from '../../lib/orpc'
import { useServerAliases } from '../../models/useServerAliases'
import { rememberCreatedAlias } from '../../catalog/communityOverlay'
import type { FlattenedSheet } from '../../songs'
import { formatErrorMessage } from '../../utils/formatErrorMessage'
import { MotionButtonBase } from '../../utils/motion'
import { SheetListItemContent } from './SheetListItem'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const AddSheetAltNameButton: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const locale = useLocale()
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

      toast.success(m.sheet_aliases_toastSuccess({ name: newAltName.trim() }, { locale }))
      captureAnalyticsEvent('sheet_alias_created', {
        song_id: sheet.songId,
        sheet_type: sheet.type,
        sheet_difficulty: sheet.difficulty,
      })
      setOpen(false)
      setNewAltName('')
      // Show the new alias at once: the shared edge copy of the list can take a few minutes to include it
      const created = { song_id: sheet.songId, name: newAltName.trim() }
      rememberCreatedAlias(created)
      void mutate(
        (aliases) =>
          aliases?.some((alias) => alias.song_id === created.song_id && alias.name === created.name)
            ? aliases
            : [...(aliases ?? []), created],
        { revalidate: false },
      )
    } catch (e: any) {
      captureAnalyticsEvent('sheet_alias_failed', {
        song_id: sheet.songId,
        sheet_type: sheet.type,
        sheet_difficulty: sheet.difficulty,
        error_code: 'request_failed',
      })
      toast.error(m.sheet_aliases_toastFailed({ error: formatErrorMessage(e) }, { locale }))
    }
  }, [newAltName, sheet.songId, mutate, locale])

  return (
    <>
      <LoginDialog />
      <MotionButtonBase
        className="h-6 glass-inset inline-flex self-start items-center justify-center gap-1 px-2 cursor-pointer text-fg-1 hover:bg-white/80 active:bg-black/6 transition-colors duration-150 mt-1 -ml-2"
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

        <span className="text-xs font-semibold">{m.sheet_aliases_addNew({}, { locale })}</span>
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
          <h2 className="m-0 text-lg font-semibold">{m.sheet_aliases_dialogTitle({}, { locale })}</h2>
          <div className="text-lg">
            <SheetListItemContent sheet={sheet} />
          </div>

          {session ? (
            <div className="flex flex-col gap-2">
              <TextField
                label={m.sheet_aliases_inputLabel({}, { locale })}
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
                {loading ? m.sheet_aliases_adding({}, { locale }) : m.sheet_aliases_addButton({}, { locale })}
              </Button>
            </div>
          ) : (
            // Signed out: say why and offer the one action, instead of a disabled form under an overlay
            <div className="flex flex-col items-start gap-2">
              <p className="m-0 text-sm text-fg-2">{m.sheet_aliases_loginRequired({}, { locale })}</p>
              <Button variant="contained" onClick={openLoginDialog}>
                {m.auth_login_label({}, { locale })}
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}