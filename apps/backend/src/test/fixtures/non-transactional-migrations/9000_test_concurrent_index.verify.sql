SELECT EXISTS (
  SELECT 1
  FROM pg_index AS index_state
  JOIN pg_class AS index_relation ON index_relation.oid = index_state.indexrelid
  JOIN pg_class AS table_relation ON table_relation.oid = index_state.indrelid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
  JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
  WHERE table_namespace.nspname = 'public'
    AND table_relation.relname = 'migration_runner_fixture'
    AND index_relation.relname = 'migration_runner_fixture_value_idx'
    AND index_state.indisvalid
    AND index_state.indisready
    AND NOT index_state.indisunique
    AND NOT index_state.indisexclusion
    AND index_state.indimmediate
    AND NOT index_state.indnullsnotdistinct
    AND index_state.indnkeyatts = 1
    AND index_state.indnatts = 1
    AND index_state.indexprs IS NULL
    AND index_state.indpred IS NULL
    AND access_method.amname = 'btree'
    AND pg_get_indexdef(index_state.indexrelid, 1, true) = 'value'
) AS verified;
