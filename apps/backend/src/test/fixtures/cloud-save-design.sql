-- Verbatim copy of the §4.2 DDL in gekichumai/meta docs-zh/design/cloud-save.md (2026-11-02).
-- cloud-save-schema.test.ts checks that the Drizzle migrations build the same tables.

-- ===== PR 1: feature flags =====
CREATE TABLE feature_flag_overrides (
  flag        text NOT NULL,                       -- 'cloud_save' | 'server_imports'
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL,
  source      text NOT NULL CHECK (source IN ('admin','opt_in')),
  consent_version text,                            -- opt_in 时记录同意的隐私条款版本
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flag, user_id)
);
CREATE INDEX feature_flag_overrides_user_idx ON feature_flag_overrides(user_id);

-- ===== PR 2: cloud save =====
CREATE TABLE score_saves (
  id                 text PRIMARY KEY,             -- 'dsav_' + nanoid
  user_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  region             text NOT NULL CHECK (region IN ('jp','intl','cn','_generic')),
  game_version       text,                         -- festival-plus..circle-plus；NULL = 跟随客户端
  client_profile_key text,                         -- iOS profileID（如 'preset-japan'）/ Web 'web-local'
  revision           bigint NOT NULL DEFAULT 0,    -- 每写一行 +1（逐行单调，见 §5.2）
  tombstone_horizon  bigint NOT NULL DEFAULT 0,    -- 已清理墓碑的最大 revision
  record_count       integer NOT NULL DEFAULT 0,   -- 存活记录数
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz                   -- 软删除，30 天后硬删
);
CREATE INDEX score_saves_user_idx ON score_saves(user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX score_saves_user_profile_key ON score_saves(user_id, client_profile_key)
  WHERE deleted_at IS NULL AND client_profile_key IS NOT NULL;

CREATE TABLE score_import_jobs (
  id                 text PRIMARY KEY,             -- 'dimp_' + nanoid
  user_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  save_id            text NOT NULL REFERENCES score_saves(id) ON DELETE CASCADE,
  source             text NOT NULL CHECK (source IN (
                       'maimai-net-jp','maimai-net-intl','lxns','diving-fish',
                       'aqua-dx','mu-net','aqua-sqlite','dxrating-json','legacy-local')),
  fetched_by         text NOT NULL CHECK (fetched_by IN ('server','client')),
  source_account_id  text,                         -- 好友码 / LXNS friend_code / DF 用户名或QQ；client 作业为客户端声称值
  source_account_kind text CHECK (source_account_kind IN ('friend_code','lxns_friend_code','df_username','df_qq','segaid_hash','claimed')),
  trigger            text NOT NULL CHECK (trigger IN ('user','auto','migration')),
  idempotency_key    text NOT NULL,
  status             text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  started_at         timestamptz NOT NULL DEFAULT now(),  -- 服务端时钟
  fetched_at         timestamptz,                  -- server: 上游响应完成时的服务端时钟；client: 客户端声称
  finished_at        timestamptz,
  raw_payload_sha256 text,                         -- 规范化 JSON（键排序）的 sha256 hex
  counts             jsonb NOT NULL DEFAULT '{}',  -- {fetched,inserted,improved,provenanceUpgraded,unchanged,keptUserEdit,skippedDeleted,skippedUnknownSheet,rejected}
  error_code         text,
  UNIQUE (user_id, idempotency_key),
  UNIQUE (id, fetched_by)                          -- 供 score_records 复合外键
);
CREATE INDEX score_import_jobs_save_idx ON score_import_jobs(save_id, started_at DESC);
CREATE UNIQUE INDEX score_import_jobs_one_running ON score_import_jobs(save_id, source)
  WHERE status = 'running';                        -- 每 (save, source) 至多一个运行中作业

CREATE TABLE score_records (
  save_id            text NOT NULL REFERENCES score_saves(id) ON DELETE CASCADE,
  sheet_id           text NOT NULL CHECK (sheet_id ~ '^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$'),
                                                   -- 与 sheet-identity.ts:4-6 完全一致；应用层同时调用 isPublicSheetId
  user_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  achievement        integer NOT NULL CHECK (achievement BETWEEN 0 AND 1010000),  -- 1/10000 %
  combo_flag         text CHECK (combo_flag IN ('fc','fcp','ap','app')),
  sync_flag          text CHECK (sync_flag IN ('fs','fsp','fsd','fsdp','sync')),
  dx_score           integer CHECK (dx_score >= 0),
  best50_bucket      text CHECK (best50_bucket IN ('b15','b35')),
  provider_record_id text,                         -- text：iOS 成绩为 Int、历史为 String
  -- provenance（当前所持值的来源）
  source             text NOT NULL,                -- 作业来源之一，或 'manual'
  claimed_source     text,                         -- 客户端声称的原始来源（如 JSON 内 'lxns'），仅展示为"声称"
  fetched_by         text NOT NULL CHECK (fetched_by IN ('server','client')),
  verification       text NOT NULL CHECK (verification IN ('verified','client_reported','user_edited')),
  entry_method       text NOT NULL CHECK (entry_method IN ('import','typed','keypad','photo','file','migration')),
  source_account_id  text,
  import_job_id      text,
  raw_payload_sha256 text,
  fetched_at         timestamptz,
  edited_from_job_id text,                         -- user_edited 时被覆盖的导入作业（审计）
  -- sync
  revision           bigint NOT NULL,
  client_mutation_id text,
  value_changed_at   timestamptz NOT NULL DEFAULT now(),   -- 服务端时钟
  client_edited_at   timestamptz,                  -- 设备上报，仅展示
  deleted_at         timestamptz,                  -- 墓碑；墓碑保留被删时的值，用于"严格更优才复活"
  PRIMARY KEY (save_id, sheet_id),
  FOREIGN KEY (import_job_id, fetched_by) REFERENCES score_import_jobs(id, fetched_by),  -- 默认 NO ACTION：级联删除同语句内安全
  CHECK (verification <> 'verified'
         OR (fetched_by = 'server' AND import_job_id IS NOT NULL AND raw_payload_sha256 IS NOT NULL AND fetched_at IS NOT NULL)),
  CHECK (source <> 'manual' OR verification <> 'verified'),
  CHECK (source <> 'demo')
);
CREATE INDEX score_records_cursor_idx ON score_records(save_id, revision);
CREATE INDEX score_records_user_idx ON score_records(user_id);

-- 值/来源变更日志（仅记录"实际生效"的变更，不记录 unchanged，防写放大）
CREATE TABLE score_record_events (
  id                 bigserial PRIMARY KEY,
  save_id            text NOT NULL REFERENCES score_saves(id) ON DELETE CASCADE,
  user_id            text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sheet_id           text NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('import_applied','provenance_upgraded','manual_set','delete','restore','superseded')),
  achievement integer, combo_flag text, sync_flag text, dx_score integer, best50_bucket text,
  source text NOT NULL, claimed_source text,
  fetched_by text NOT NULL, verification text NOT NULL, entry_method text,
  source_account_id text, import_job_id text, raw_payload_sha256 text, fetched_at timestamptz,
  client_mutation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX score_record_events_sheet_idx ON score_record_events(save_id, sheet_id, id DESC);
-- 保留策略：每 (save_id, sheet_id) 最多 20 条；进程内清理任务每日执行

-- 客户端操作幂等账本（30 天 TTL）
CREATE TABLE score_mutations (
  user_id      text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mutation_id  text NOT NULL,                      -- 客户端 UUIDv7，入 outbox 时生成并持久化
  save_id      text NOT NULL REFERENCES score_saves(id) ON DELETE CASCADE,
  result       jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mutation_id)
);

-- rating 快照（#184）
CREATE TABLE score_save_snapshots (
  id            bigserial PRIMARY KEY,
  save_id       text NOT NULL REFERENCES score_saves(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  at_revision   bigint NOT NULL,
  b15_sum integer NOT NULL, b35_sum integer NOT NULL, b50_sum integer NOT NULL,
  record_count  integer NOT NULL,
  game_version  text NOT NULL,
  detail        jsonb,                             -- 不透明，客户端计算
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX score_save_snapshots_save_idx ON score_save_snapshots(save_id, created_at DESC);
