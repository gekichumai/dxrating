CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_comments_recent_idx
ON public.comments USING btree (
  created_at DESC NULLS LAST,
  id DESC NULLS LAST
)
