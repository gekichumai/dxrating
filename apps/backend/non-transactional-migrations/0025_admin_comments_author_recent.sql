CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_comments_author_recent_idx
ON public.comments USING btree (
  created_by,
  created_at DESC NULLS LAST,
  id DESC NULLS LAST
)
