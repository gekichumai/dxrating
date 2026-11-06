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
  count: number
  variant: 'up' | 'down'
  onClick: () => void
}> = ({ active, disabled, label, count, variant, onClick }) => {
  const ActiveIcon = variant === 'up' ? IconMdiThumbUp : IconMdiThumbDown
  const InactiveIcon = variant === 'up' ? IconMdiThumbUpOutline : IconMdiThumbDownOutline
  const Icon = active ? ActiveIcon : InactiveIcon

  return (
    <ButtonBase
      className={clsx(
        'h-8 min-w-14 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-solid px-2.5 text-sm transition-colors',
        active
          ? variant === 'up'
            ? 'border-green-300 bg-green-50 text-green-700'
            : 'border-red-300 bg-red-50 text-red-700'
          : 'border-black/10 text-fg-2 hover:bg-black/5',
        disabled && 'opacity-60',
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="num leading-none">{count}</span>
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
        <div className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.group?.color ?? 'var(--fg-2)' }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-1">
              {localizeMessage(entry.tag.localized_name)}
            </span>
            <span className="num shrink-0 text-xs text-fg-2">{t('sheet:tags.vote.score', { score: entry.score })}</span>
          </div>

          <div className="text-xs leading-normal text-fg-2 [&_p]:my-0">
            <Markdown content={localizeMessage(entry.tag.localized_description)} />
          </div>

          <div className="flex items-center gap-1.5">
            <VoteButton
              variant="up"
              active={userVote === 1}
              disabled={pending}
              label={t('sheet:tags.vote.upvote')}
              count={entry.upvotes}
              onClick={() => vote(1)}
            />
            <VoteButton
              variant="down"
              active={userVote === -1}
              disabled={pending}
              label={t('sheet:tags.vote.downvote')}
              count={entry.downvotes}
              onClick={() => vote(-1)}
            />
            {canDetach && (
              <ButtonBase
                className="ms-auto h-8 inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 text-sm text-[var(--danger)] transition-colors hover:bg-red-50"
                onClick={detach}
                disabled={pending}
              >
                <IconMdiTrashCanOutline aria-hidden="true" className="h-4 w-4" />
                {t('sheet:tags.vote.remove')}
              </ButtonBase>
            )}
          </div>

          {!session && (
            <button
              type="button"
              className="link cursor-pointer border-none bg-transparent p-0 text-left text-xs"
              onClick={openLoginDialog}
            >
              {t('sheet:tags.vote.login-required')}
            </button>
          )}

          {isCreator && !canDetach && <div className="text-xs text-fg-2">{t('sheet:tags.vote.remove-expired')}</div>}
        </div>
      </Popover>
    </>
  )
}