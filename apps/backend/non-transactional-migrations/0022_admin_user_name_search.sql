CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_user_search_name_lower_pattern_id_idx
ON public."user" USING btree (
  lower(btrim(regexp_replace(normalize(name, NFKC), '[[:space:]]+', ' ', 'g'))) text_pattern_ops,
  id
)
