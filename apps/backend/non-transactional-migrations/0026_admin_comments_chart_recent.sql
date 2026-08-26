CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_comments_chart_recent_idx
ON public.comments USING btree (
  song_id,
  sheet_type,
  sheet_difficulty,
  created_at DESC NULLS LAST,
  id DESC NULLS LAST
)
