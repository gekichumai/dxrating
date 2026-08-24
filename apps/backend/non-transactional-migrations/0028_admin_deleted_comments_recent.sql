CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_comment_moderation_state_deleted_comment_recent_idx
ON public.admin_comment_moderation_state USING btree (
  comment_created_at DESC NULLS LAST,
  comment_id DESC NULLS LAST
)
WHERE established_action = 'delete'
  AND comment_created_at IS NOT NULL
