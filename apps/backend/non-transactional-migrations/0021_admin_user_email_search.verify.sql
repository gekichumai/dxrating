SELECT COALESCE((
  SELECT index.indisvalid
    AND index.indisready
    AND NOT index.indisunique
    AND NOT index.indisprimary
    AND NOT index.indisexclusion
    AND index.indpred IS NULL
    AND index.indnkeyatts = 2
    AND index.indnatts = 2
    AND access_method.amname = 'btree'
    AND pg_get_indexdef(index.indexrelid, 1, true) = 'lower(btrim(NORMALIZE(email, NFKC)))'
    AND pg_get_indexdef(index.indexrelid, 2, true) = 'id'
    AND (
      SELECT array_agg(operator_class.opcname ORDER BY classes.ordinality)
      FROM unnest(index.indclass::oid[]) WITH ORDINALITY AS classes(operator_class_oid, ordinality)
      JOIN pg_opclass operator_class ON operator_class.oid = classes.operator_class_oid
    ) = ARRAY['text_ops', 'text_ops']::name[]
  FROM pg_index index
  JOIN pg_class index_relation ON index_relation.oid = index.indexrelid
  JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_class table_relation ON table_relation.oid = index.indrelid
  JOIN pg_namespace table_namespace ON table_namespace.oid = table_relation.relnamespace
  JOIN pg_am access_method ON access_method.oid = index_relation.relam
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'admin_user_search_email_lower_id_idx'
    AND table_namespace.nspname = 'public'
    AND table_relation.relname = 'user'
), FALSE) AS verified
