CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_user_search_email_lower_id_idx
ON public."user" USING btree (lower(btrim(normalize(email, NFKC))), id)
