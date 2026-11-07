import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material'
import { MoreHorizontal } from 'lucide-react'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { apiClient } from '../../lib/orpc'
import { useAuth } from '../../hooks/useAuth'
import { hideComment } from './commentVisibility'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

type Comment = { id: number; author_id: string }
type SafetyAction = 'report' | 'block'

const SAFETY_ACTION_LABELS = {
  report: m.sheet_comments_safety_report,
  block: m.sheet_comments_safety_block,
} satisfies Record<SafetyAction, PlainMessage>
const SAFETY_ACTION_DESCRIPTIONS = {
  report: m.sheet_comments_safety_reportDescription,
  block: m.sheet_comments_safety_blockDescription,
} satisfies Record<SafetyAction, PlainMessage>
const SAFETY_ACTION_SUCCESS = {
  report: m.sheet_comments_safety_reportSuccess,
  block: m.sheet_comments_safety_blockSuccess,
} satisfies Record<SafetyAction, PlainMessage>

export function CommentActions({ comment }: { comment: Comment }) {
  const locale = useLocale()
  const { user, ensureAuthenticated, LoginDialog } = useAuth()
  const { mutate } = useSWRConfig()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [action, setAction] = useState<SafetyAction | null>(null)
  const [pending, setPending] = useState(false)
  if (user?.id === comment.author_id) return null

  const submit = async () => {
    if (!action || pending || !user) return
    setPending(true)
    const undo = hideComment(user.id, comment.id, action === 'block' ? comment.author_id : undefined)
    try {
      if (action === 'report') await apiClient.comments.report({ commentId: comment.id })
      else await apiClient.comments.blockAuthor({ commentId: comment.id })
      await mutate(
        (key) => Array.isArray(key) && key[0] === 'comments.list' && key[1] === user.id,
        (data: Comment[] | undefined) =>
          data?.filter((item) => (action === 'report' ? item.id !== comment.id : item.author_id !== comment.author_id)),
        { revalidate: true },
      ).catch(() => {
        /* The server saved the preference; keep the local filter if refresh fails. */
      })
      toast.success(SAFETY_ACTION_SUCCESS[action]({}, { locale }))
      setAction(null)
    } catch {
      undo()
      toast.error(m.sheet_comments_safety_error({}, { locale }))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <IconButton
        aria-label={m.sheet_comments_safety_actions({}, { locale })}
        size="small"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreHorizontal size={20} />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {(['report', 'block'] as const).map((value) => (
          <MenuItem
            key={value}
            onClick={async () => {
              setAnchor(null)
              if (await ensureAuthenticated()) setAction(value)
            }}
          >
            {SAFETY_ACTION_LABELS[value]({}, { locale })}
          </MenuItem>
        ))}
      </Menu>
      <Dialog
        open={!!action}
        onClose={() => {
          if (!pending) setAction(null)
        }}
      >
        <DialogTitle>{action ? SAFETY_ACTION_LABELS[action]({}, { locale }) : ''}</DialogTitle>
        <DialogContent>
          <DialogContentText>{action ? SAFETY_ACTION_DESCRIPTIONS[action]({}, { locale }) : ''}</DialogContentText>
        </DialogContent>
        <DialogActions>
          {/* Blocking can't be undone yet, so Cancel takes focus and the confirm action carries the danger colour */}
          <Button disabled={pending} onClick={() => setAction(null)} color="inherit" autoFocus={action === 'block'}>
            {m.sheet_comments_safety_cancel({}, { locale })}
          </Button>
          <Button
            disabled={pending}
            onClick={submit}
            variant="contained"
            color={action === 'block' ? 'error' : 'primary'}
          >
            {action ? SAFETY_ACTION_LABELS[action]({}, { locale }) : ''}
          </Button>
        </DialogActions>
      </Dialog>
      <LoginDialog />
    </>
  )
}