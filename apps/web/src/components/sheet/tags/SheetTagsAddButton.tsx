import { Chip, Dialog, Grow } from '@mui/material'
import clsx from 'clsx'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import IconMdiTagPlus from '~icons/mdi/tag-plus'
import { authClient } from '../../../lib/auth-client'
import { orpc } from '../../../lib/orpc'
import type { FlattenedSheet } from '../../../songs'
import { deriveColor } from '../../../utils/color'
import { isBuildPlatformApp } from '../../../utils/env'
import { formatErrorMessage } from '../../../utils/formatErrorMessage'
import { MotionButtonBase, MotionTooltip } from '../../../utils/motion'
import { zoomTransitions } from '../../../utils/motionConstants'
import { useLocalizedMessageTranslation } from '../../../utils/useLocalizedMessageTranslation'
import { Markdown } from '../../global/Markdown'
import { SheetListItemContent } from '../SheetListItem'
import { useSheetTags } from './useSheetTags'

const SheetTagsAddDialog: FC<{
  sheet: FlattenedSheet
}> = ({ sheet }) => {
  const { t } = useTranslation(['sheet'])
  const [pending, setPending] = useState(false)
  const localizeMessage = useLocalizedMessageTranslation()
  const { data: sessionData } = authClient.useSession()
  const session = sessionData?.session

  const { data: tagGroups, isLoading: loadingTags } = useSWR('tags.grouped', async () => {
    // We can reuse useCombinedTags or call orpc
    const { tags, tagGroups } = await orpc.tags.list()

    // Grouping logic adapted for clean data
    const groupMap = new Map()
    tagGroups.forEach(g => groupMap.set(g.id, { ...g, tags: [] }))
    
    // Fallback for tags without group?
    // Current logic groups by group_id.
    
    // Perform mapping
    const grouped: any[] = []
    
    // Actually the UI expects { group: TagGroup, tags: Tag[] }[]
    
    // Map groups
    const result = tagGroups.map(g => ({
        group: {
            id: g.id,
            localized_name: JSON.parse(g.localized_name), // Backend returns stringified JSON? 
            // In contract: localized_name: z.string().
            // In DB: localized_name: Record<string, string>.
            // Drizzle returns what DB has.
            // If DB column is JSONB/JSON, Drizzle usually parses it if configured or returns object.
            // My Schema says `text`. So it IS stringified if inserted as string.
            // Supabase client returns JSON object.
            // My backend returns string?
            // Let's assume JSON.parse is needed if it's text.
            color: g.color
        },
        tags: tags.filter(t => t.group_id === g.id).map(t => ({
            ...t,
            localized_name: JSON.parse(t.localized_name) as any,
            localized_description: JSON.parse(t.localized_description) as any,
            group: g // UI might need this nested reference
        }))
    }))
    
    return result
  })
  const { data: existingTags, isLoading: loadingExistingTags, mutate: mutateExistingTags } = useSheetTags(sheet)

  const existingTagsIDList = existingTags?.map(({ id }) => id) ?? []

  const addTag = async (tagId: number) => {
    setPending(true)
    try {
      await orpc.tags.attach({
          songId: sheet.songId,
          sheetType: sheet.type,
          sheetDifficulty: sheet.difficulty,
          tagId: tagId
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
      <div className="text-lg font-bold">{t('sheet:tags.add.title')}</div>
      <div className="text-lg">
        <SheetListItemContent sheet={sheet} />
      </div>

      <div className="h-px w-full bg-gray-2 mt-1 mb-2" />
      <div className="flex flex-wrap gap-2">
        {loadingTags || loadingExistingTags ? (
          Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: index is stable
            <Chip key={i} color="primary" disabled className="rounded-lg animate-pulse w-16" />
          ))
        ) : (
          <div className="flex flex-col gap-2">
            {tagGroups?.map(({ group, tags }) => (
              <div key={group?.id} className="flex gap-1 items-center">
                <div className="flex items-center">
                  <div className="text-base py-1 whitespace-nowrap">{localizeMessage(group?.localized_name)}</div>
                  <div className="w-px h-7 bg-gray-2 shrink-0 ml-2" />
                </div>
                <div className="flex flex-wrap gap-1 grow ml-2">
                  {tags.map((tag) => {
                    const exists = existingTagsIDList.includes(tag.id)

                    return (
                      <MotionTooltip
                        {...zoomTransitions}
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
                            'rounded-lg border border-solid',
                            pending && 'animate-pulse -animate-delay-1000',
                          )}
                          style={{
                            backgroundColor: tag.group?.color,
                            borderColor: deriveColor(tag.group?.color ?? '#000', 'border'),
                          }}
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
        <div className="text-gray-500 absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-80 p-8">
          {isBuildPlatformApp ? (
            <div className="text-center font-bold">Adding tags is currently unavailable in the app.</div>
          ) : (
            <div className="text-center font-bold">Login or Register an account to add tags.</div>
          )}
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
        // {...zoomTransitions}
        className="h-6 border-1 border-solid border-gray-200 rounded-lg flex items-center justify-center px-2 cursor-pointer bg-gray-100 hover:bg-gray-200 hover:border-gray-300 active:bg-gray-300 active:border-gray-400 transition"
        onClick={() => {
          setOpen(true)
        }}
      >
        <IconMdiTagPlus className="h-4 w-4" />

        <span className="ml-1 text-xs">{t('sheet:tags.add.button')}</span>
      </MotionButtonBase>
    </>
  )
}
