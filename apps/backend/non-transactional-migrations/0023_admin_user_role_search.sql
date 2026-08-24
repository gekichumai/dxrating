CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_user_search_role_id_idx
ON public."user" USING btree (role, id)
