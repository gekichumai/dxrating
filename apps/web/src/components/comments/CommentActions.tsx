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
import { useTranslation } from 'react-i18next'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { apiClient } from '../../lib/orpc'
import { useAuth } from '../../hooks/useAuth'
import { hideComment } from './commentVisibility'

type Comment = { id: number; author_id: string }
export function CommentActions({ comment }: { comment: Comment }) {
  const { t } = useTranslation('sheet')
  const { user, ensureAuthenticated, LoginDialog } = useAuth()
  const { mutate } = useSWRConfig()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [action, setAction] = useState<'report' | 'block' | null>(null)
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
      toast.success(t(`comments.safety.${action}-success`))
      setAction(null)
    } catch {
      undo()
      toast.error(t('comments.safety.error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <IconButton
        aria-label={t('comments.safety.actions')}
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
            {t(`comments.safety.${value}`)}
          </MenuItem>
        ))}
      </Menu>
      <Dialog
        open={!!action}
        onClose={() => {
          if (!pending) setAction(null)
        }}
      >
        <DialogTitle>{action ? t(`comments.safety.${action}`) : ''}</DialogTitle>
        <DialogContent>
          <DialogContentText>{action ? t(`comments.safety.${action}-description`) : ''}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={() => setAction(null)}>
            {t('comments.safety.cancel')}
          </Button>
          <Button disabled={pending} onClick={submit}>
            {action ? t(`comments.safety.${action}`) : ''}
          </Button>
        </DialogActions>
      </Dialog>
      <LoginDialog />
    </>
  )
}