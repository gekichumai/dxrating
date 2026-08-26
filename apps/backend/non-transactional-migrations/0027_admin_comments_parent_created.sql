CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_comments_parent_created_idx
ON public.comments USING btree (
  parent_id,
  created_at,
  id
)
WHERE parent_id IS NOT NULL
