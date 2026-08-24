SELECT COALESCE((
  SELECT index.indisvalid
    AND index.indisready
    AND NOT index.indisunique
    AND NOT index.indisprimary
    AND NOT index.indisexclusion
    AND index.indpred IS NOT NULL
    AND index.indnkeyatts = 3
    AND index.indnatts = 3
    AND index.indoption::text = '0 0 0'
    AND access_method.amname = 'btree'
    AND pg_get_indexdef(index.indexrelid, 1, true) = 'parent_id'
    AND pg_get_indexdef(index.indexrelid, 2, true) = 'created_at'
    AND pg_get_indexdef(index.indexrelid, 3, true) = 'id'
    AND pg_get_expr(index.indpred, index.indrelid, true) = 'parent_id IS NOT NULL'
    AND (
      SELECT array_agg(operator_class.opcname ORDER BY classes.ordinality)
      FROM unnest(index.indclass::oid[]) WITH ORDINALITY AS classes(operator_class_oid, ordinality)
      JOIN pg_opclass operator_class ON operator_class.oid = classes.operator_class_oid
    ) = ARRAY['int8_ops', 'timestamp_ops', 'int8_ops']::name[]
  FROM pg_index index
  JOIN pg_class index_relation ON index_relation.oid = index.indexrelid
  JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_class table_relation ON table_relation.oid = index.indrelid
  JOIN pg_namespace table_namespace ON table_namespace.oid = table_relation.relnamespace
  JOIN pg_am access_method ON access_method.oid = index_relation.relam
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'admin_comments_parent_created_idx'
    AND table_namespace.nspname = 'public'
    AND table_relation.relname = 'comments'
), FALSE) AS verified
