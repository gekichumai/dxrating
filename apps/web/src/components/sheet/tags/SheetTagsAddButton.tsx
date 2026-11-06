import { Button, Chip, Dialog, Grow } from '@mui/material'
import clsx from 'clsx'
import { type CSSProperties, type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import IconMdiTagPlus from '~icons/mdi/tag-plus'
import { useAuth } from '../../../hooks/useAuth'
import { apiClient as client } from '../../../lib/orpc'
import type { FlattenedSheet } from '../../../songs'
import { deriveColor } from '../../../utils/color'
import { formatErrorMessage } from '../../../utils/formatErrorMessage'
import { MotionButtonBase, MotionTooltip } from '../../../utils/motion'
import { chipPresenceTransitions } from '../sheetMotion'
import { useLocalizedMessageTranslation } from '../../../utils/useLocalizedMessageTranslation'
import { Markdown } from '../../global/Markdown'
import { SheetListItemContent } from '../SheetListItem'
import { useSheetTags } from './useSheetTags'

const SheetTagsAddDialog: FC<{
  sheet: FlattenedSheet
}> = ({ sheet }) => {
  const { t } = useTranslation(['sheet', 'auth'])
  const [pending, setPending] = useState(false)
  const localizeMessage = useLocalizedMessageTranslation()
  const { session, openLoginDialog, LoginDialog } = useAuth()

  const { data: tagGroups, isLoading: loadingTags } = useSWR('tags.grouped', async () => {
    const { tags, tagGroups } = await client.tags.list()

    return tagGroups.map((g) => ({
      group: g,
      tags: tags
        .filter((t) => t.group_id === g.id)
        .map((t) => ({
          ...t,
          group: g,
        })),
    }))
  })
  const { data: existingTags, isLoading: loadingExistingTags, mutate: mutateExistingTags } = useSheetTags(sheet)

  const existingTagsIDList = existingTags?.map(({ id }) => id) ?? []

  const addTag = async (tagId: number) => {
    setPending(true)
    try {
      await client.tags.attach({
        songId: sheet.songId,
        sheetId: sheet.id,
        sheetType: sheet.type,
        sheetDifficulty: sheet.difficulty,
        tagId: tagId,
      })

      toast.success(t('sheet:tags.add.toast-success'), {
        id: `tag-add-success:${tagId}`,
      })
      mutateExistingTags()
    } catch (error) {
      console.error('Failed to add tag', error)

      toast.error(t('sheet:tags.add.toast-failed', { error: formatErrorMessage(error) }), {
        id: `tag-add-failed:${tagId}`,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-4 relative">
      <LoginDialog />
      <h2 className="m-0 text-lg font-semibold">{t('sheet:tags.add.title')}</h2>
      <div className="text-lg">
        <SheetListItemContent sheet={sheet} />
      </div>

      <div className="h-px w-full bg-black/8 mt-1 mb-2" />
      <div className="flex flex-wrap gap-2">
        {loadingTags || loadingExistingTags ? (
          Array.from({ length: 5 }).map((_, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- index is stable
            <Chip key={i} color="primary" disabled className="rounded-lg animate-pulse w-16" />
          ))
        ) : (
          <div className="flex flex-col gap-2">
            {tagGroups?.map(({ group, tags }) => (
              <div key={group?.id} className="flex gap-1 items-center">
                <div className="flex items-center">
                  <div className="text-base py-1 whitespace-nowrap">{localizeMessage(group?.localized_name)}</div>
                  <div className="w-px h-7 bg-black/8 shrink-0 ml-2" />
                </div>
                <div className="flex flex-wrap gap-1 grow ml-2">
                  {tags.map((tag) => {
                    const exists = existingTagsIDList.includes(tag.id)

                    return (
                      <MotionTooltip
                        {...chipPresenceTransitions}
                        key={tag.id}
                        title={<Markdown content={localizeMessage(tag.localized_description)} />}
                        arrow
                        slotProps={{
                          popper: {
                            modifiers: [
                              {
                                name: 'offset',
                                options: {
                                  offset: [0, -8],
                                },
                              },
                            ],
                          },
                        }}
                      >
                        <Chip
                          key={tag.id}
                          label={localizeMessage(tag.localized_name)}
                          onClick={() => addTag(tag.id)}
                          disabled={pending || exists}
                          className={clsx(
                            // Group colours are pastels: dark mode's light chip text would vanish on them
                            'rounded-lg border border-solid dark:!text-[var(--tag-fg)]',
                            pending && 'animate-pulse -animate-delay-1000',
                          )}
                          style={
                            {
                              backgroundColor: tag.group?.color,
                              borderColor: deriveColor(tag.group?.color ?? '#000', 'border'),
                              '--tag-fg': tag.group?.color ? deriveColor(tag.group.color, 'text') : undefined,
                            } as CSSProperties
                          }
                        />
                      </MotionTooltip>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!session && (
        // Signed out: a real button on a scrim over the tag picker, reachable by keyboard and named by its text
        <div className="absolute inset-0 z-1 flex flex-col items-center justify-center gap-2 bg-white/85 p-8 text-center">
          <p className="m-0 text-sm text-fg-1">{t('sheet:tags.add.login-required')}</p>
          <Button variant="contained" onClick={openLoginDialog}>
            {t('auth:login.label')}
          </Button>
        </div>
      )}
    </div>
  )
}

export const SheetTagsAddButton: FC<{ sheet: FlattenedSheet }> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const [open, setOpen] = useState(false)

  return (
    <>
      <Dialog open={open} onClose={() => setOpen(false)} TransitionComponent={Grow}>
        <SheetTagsAddDialog sheet={sheet} />
      </Dialog>

      <MotionButtonBase
        // {...chipPresenceTransitions}
        className="h-6 glass-inset flex items-center justify-center gap-1 px-2 cursor-pointer text-fg-1 hover:bg-white/80 active:bg-black/6 transition-colors duration-150"
        onClick={() => {
          setOpen(true)
        }}
      >
        <IconMdiTagPlus aria-hidden="true" className="h-4 w-4" />

        <span className="text-xs font-semibold">{t('sheet:tags.add.button')}</span>
      </MotionButtonBase>
    </>
  )
}