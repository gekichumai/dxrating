import { DifficultyEnum, TypeEnum } from "@gekichumai/dxdata";
import sqljs from "sql.js";

export function convertQueryExecResultToEntries<T>(
  result: sqljs.QueryExecResult,
): T[] {
  const columns = result.columns;
  const values = result.values;

  return values.map((row) => {
    const entry: T = {} as T;
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const value = row[i];

      entry[column as keyof T] = value as T[keyof T];
    }

    return entry;
  });
}

export interface AquaUser {
  id: number;
  aime_card_id: number;
  user_name: string;
  is_net_member: number;
  icon_id: number;
  plate_id: number;
  title_id: number;
  partner_id: number;
  frame_id: number;
  select_map_id: number;
  total_awake: number;
  grade_rating: number;
  music_rating: number;
  player_rating: number;
  highest_rating: number;
  grade_rank: number;
  class_rank: number;
  course_rank: number;
  chara_slot: string;
  chara_lock_slot: string;
  content_bit: number;
  play_count: number;
  event_watched_date: string;
  last_game_id: string;
  last_rom_version: string;
  last_data_version: string;
  last_login_date: string;
  last_play_date: string;
  last_play_credit: number;
  last_play_mode: number;
  last_place_id: number;
  last_place_name: string;
  last_all_net_id: number;
  last_region_id: number;
  last_region_name: string;
  last_client_id: string;
  last_country_code: string;
  last_selectemoney: number;
  last_select_ticket: number;
  last_select_course: number;
  last_count_course: number;
  first_game_id: string;
  first_rom_version: string;
  first_data_version: string;
  first_play_date: string;
  compatible_cm_version: string;
  daily_bonus_date: string;
  daily_course_bonus_date: string;
  play_vs_count: number;
  play_sync_count: number;
  win_count: number;
  help_count: number;
  combo_count: number;
  total_deluxscore: number;
  total_basic_deluxscore: number;
  total_advanced_deluxscore: number;
  total_expert_deluxscore: number;
  total_master_deluxscore: number;
  total_re_master_deluxscore: number;
  total_sync: number;
  total_basic_sync: number;
  total_advanced_sync: number;
  total_expert_sync: number;
  total_master_sync: number;
  total_re_master_sync: number;
  total_achievement: number;
  total_basic_achievement: number;
  total_advanced_achievement: number;
  total_expert_achievement: number;
  total_master_achievement: number;
  total_re_master_achievement: number;
  date_time: number;
  player_old_rating: number;
  player_new_rating: number;
  last_pair_login_date: string;
  last_trial_play_date: string;
  ban_state: number;
}

export function readAquaUsers(db: sqljs.Database): AquaUser[] {
  const results = db.exec("SELECT * FROM maimai2_user_detail");
  if (!results || results.length === 0) {
    return [];
  }

  return convertQueryExecResultToEntries<AquaUser>(results[0]);
}

export interface AquaGamePlayFromDB {
  id: number;
  music_id: number;
  level: number;
  play_count: number;
  achievement: number;
  combo_status: number;
  sync_status: number;
  deluxscore_max: number;
  score_rank: number;
  user_id: number;
}

export interface AquaGamePlay {
  id: number;
  music_id: number;
  level: DifficultyEnum;
  play_count: number;
  achievement: number;
  combo_status: number;
  sync_status: number;
  deluxscore_max: number;
  score_rank: number;
  user_id: number;
  type: TypeEnum;
}

const AQUA_GAME_PLAY_LEVEL_TO_DIFFICULTY: { [key: number]: DifficultyEnum } = {
  0: DifficultyEnum.Basic,
  1: DifficultyEnum.Advanced,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
};

export function readAquaGamePlays(db: sqljs.Database): AquaGamePlay[] {
  const results = db.exec("SELECT * FROM maimai2_user_music_detail");
  if (!results || results.length === 0) return [];

  const records = convertQueryExecResultToEntries(
    results[0],
  ) as AquaGamePlayFromDB[];

  return records.map((record) => ({
    ...record,
    level: AQUA_GAME_PLAY_LEVEL_TO_DIFFICULTY[record.level],
    type: record.music_id >= 10000 ? TypeEnum.DX : TypeEnum.SD,
  }));
}
