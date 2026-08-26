CREATE INDEX CONCURRENTLY IF NOT EXISTS admin_profile_search_display_name_lower_pattern_id_idx
ON public.profiles USING btree (
  lower(btrim(regexp_replace(normalize(display_name, NFKC), '[[:space:]]+', ' ', 'g'))) text_pattern_ops,
  id
)
