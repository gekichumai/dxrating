CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_user_ban_state_active_subject_idx
ON public.admin_user_ban_state USING btree (subject_user_id)
INCLUDE (ban_expires_at, established_by_event_id)
WHERE established_action = 'ban'
