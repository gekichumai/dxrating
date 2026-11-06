import { ButtonBase, Popover } from '@mui/material'
import clsx from 'clsx'
import { type FC, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import IconMdiThumbDown from '~icons/mdi/thumb-down'
import IconMdiThumbDownOutline from '~icons/mdi/thumb-down-outline'
import IconMdiThumbUp from '~icons/mdi/thumb-up'
import IconMdiThumbUpOutline from '~icons/mdi/thumb-up-outline'
import IconMdiTrashCanOutline from '~icons/mdi/trash-can-outline'
import { useAuth } from '../../../hooks/useAuth'
import { apiClient as client } from '../../../lib/orpc'
import { formatErrorMessage } from '../../../utils/formatErrorMessage'
import { useLocalizedMessageTranslation } from '../../../utils/useLocalizedMessageTranslation'
import { Markdown } from '../../global/Markdown'
import type { SheetTagEntry } from './useSheetTagsDetailed'

/** Matches the backend's `TAG_SONG_DETACH_WINDOW_MS`. */
const DETACH_WINDOW_MS = 60 * 60 * 1000

const VoteButton: FC<{
  active: boolean
  disabled: boolean
  label: string
  variant: 'up' | 'down'
  onClick: () => void
}> = ({ active, disabled, label, variant, onClick }) => {
  const ActiveIcon = variant === 'up' ? IconMdiThumbUp : IconMdiThumbDown
  const InactiveIcon = variant === 'up' ? IconMdiThumbUpOutline : IconMdiThumbDownOutline
  const Icon = active ? ActiveIcon : InactiveIcon

  return (
    <ButtonBase
      className={clsx(
        'flex items-center gap-1 rounded-lg border border-solid px-2 py-1 transition',
        active
          ? variant === 'up'
            ? 'border-green-400 bg-green-50 text-green-700'
            : 'border-red-400 bg-red-50 text-red-700'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100',
        disabled && 'opacity-60',
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" />
      <span className="text-xs">{label}</span>
    </ButtonBase>
  )
}

export const TagVotePopover: FC<{
  entry: SheetTagEntry
  anchorEl: HTMLElement | null
  userVote: number | null
  currentUserId?: string
  onClose: () => void
  onChanged: () => void
}> = ({ entry, anchorEl, userVote, currentUserId, onClose, onChanged }) => {
  const { t } = useTranslation(['sheet'])
  const localizeMessage = useLocalizedMessageTranslation()
  const { session, openLoginDialog, LoginDialog } = useAuth()
  const [pending, setPending] = useState(false)

  // Only ever mounted in response to a click, so reading the wall clock here
  // cannot desynchronise the server and client renders.
  const createdAt = new Date(entry.created_at).getTime()
  const isCreator = currentUserId !== undefined && entry.created_by === currentUserId
  const withinDetachWindow = Date.now() - createdAt <= DETACH_WINDOW_MS
  const canDetach = isCreator && withinDetachWindow

  const vote = async (value: 1 | -1) => {
    if (!session) {
      openLoginDialog()
      return
    }

    setPending(true)
    try {
      await client.tags.vote({ tagSongId: entry.id, value })
      onChanged()
      toast.success(t('sheet:tags.vote.vote-success'), { id: `tag-vote-success:${entry.id}` })
    } catch (error) {
      console.error('Failed to vote on tag', error)
      toast.error(t('sheet:tags.vote.vote-failed', { error: formatErrorMessage(error) }), {
        id: `tag-vote-failed:${entry.id}`,
      })
    } finally {
      setPending(false)
    }
  }

  const detach = async () => {
    setPending(true)
    try {
      await client.tags.detach({ tagSongId: entry.id })
      onChanged()
      onClose()
      toast.success(t('sheet:tags.vote.remove-success'), { id: `tag-remove-success:${entry.id}` })
    } catch (error) {
      console.error('Failed to remove tag', error)
      toast.error(t('sheet:tags.vote.remove-failed', { error: formatErrorMessage(error) }), {
        id: `tag-remove-failed:${entry.id}`,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <LoginDialog />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { className: 'rounded-lg' } }}
      >
        <div className="flex max-w-xs flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: entry.group?.color ?? '#e5e7eb' }}
            />
            <span className="text-sm font-bold">{localizeMessage(entry.tag.localized_name)}</span>
          </div>

          <div className="text-xs text-gray-600">
            <Markdown content={localizeMessage(entry.tag.localized_description)} />
          </div>

          <div className="h-px w-full bg-gray-200" />

          <div className="flex items-center gap-2">
            <VoteButton
              variant="up"
              active={userVote === 1}
              disabled={pending}
              label={t('sheet:tags.vote.upvote')}
              onClick={() => vote(1)}
            />
            <VoteButton
              variant="down"
              active={userVote === -1}
              disabled={pending}
              label={t('sheet:tags.vote.downvote')}
              onClick={() => vote(-1)}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 tabular-nums">
            <span>{t('sheet:tags.vote.breakdown', { upvotes: entry.upvotes, downvotes: entry.downvotes })}</span>
            <span className="ml-auto">{t('sheet:tags.vote.score', { score: entry.score })}</span>
          </div>

          {!session && (
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-left text-xs text-zinc-600 underline underline-offset-2"
              onClick={openLoginDialog}
            >
              {t('sheet:tags.vote.login-required')}
            </button>
          )}

          {isCreator &&
            (canDetach ? (
              <ButtonBase
                className="flex items-center justify-center gap-1 rounded-lg border border-solid border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 transition hover:bg-red-100"
                onClick={detach}
                disabled={pending}
              >
                <IconMdiTrashCanOutline className="h-4 w-4" />
                {t('sheet:tags.vote.remove')}
              </ButtonBase>
            ) : (
              <div className="text-xs text-gray-400">{t('sheet:tags.vote.remove-expired')}</div>
            ))}
        </div>
      </Popover>
    </>
  )
}