import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import sqljs from 'sql.js'

export function convertQueryExecResultToEntries<T>(result: sqljs.QueryExecResult): T[] {
  const columns = result.columns
  const values = result.values

  return values.map((row) => {
    const entry: T = {} as T
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i]
      const value = row[i]

      entry[column as keyof T] = value as T[keyof T]
    }

    return entry
  })
}

export interface AquaUser {
  id: number
  aime_card_id: number
  user_name: string
  is_net_member: number
  icon_id: number
  plate_id: number
  title_id: number
  partner_id: number
  frame_id: number
  select_map_id: number
  total_awake: number
  grade_rating: number
  music_rating: number
  player_rating: number
  highest_rating: number
  grade_rank: number
  class_rank: number
  course_rank: number
  chara_slot: string
  chara_lock_slot: string
  content_bit: number
  play_count: number
  event_watched_date: string
  last_game_id: string
  last_rom_version: string
  last_data_version: string
  last_login_date: string
  last_play_date: string
  last_play_credit: number
  last_play_mode: number
  last_place_id: number
  last_place_name: string
  last_all_net_id: number
  last_region_id: number
  last_region_name: string
  last_client_id: string
  last_country_code: string
  last_selectemoney: number
  last_select_ticket: number
  last_select_course: number
  last_count_course: number
  first_game_id: string
  first_rom_version: string
  first_data_version: string
  first_play_date: string
  compatible_cm_version: string
  daily_bonus_date: string
  daily_course_bonus_date: string
  play_vs_count: number
  play_sync_count: number
  win_count: number
  help_count: number
  combo_count: number
  total_deluxscore: number
  total_basic_deluxscore: number
  total_advanced_deluxscore: number
  total_expert_deluxscore: number
  total_master_deluxscore: number
  total_re_master_deluxscore: number
  total_sync: number
  total_basic_sync: number
  total_advanced_sync: number
  total_expert_sync: number
  total_master_sync: number
  total_re_master_sync: number
  total_achievement: number
  total_basic_achievement: number
  total_advanced_achievement: number
  total_expert_achievement: number
  total_master_achievement: number
  total_re_master_achievement: number
  date_time: number
  player_old_rating: number
  player_new_rating: number
  last_pair_login_date: string
  last_trial_play_date: string
  ban_state: number
}

export function readAquaUsers(db: sqljs.Database): AquaUser[] {
  const results = db.exec('SELECT * FROM maimai2_user_detail')
  if (!results || results.length === 0) {
    return []
  }

  return convertQueryExecResultToEntries<AquaUser>(results[0])
}

export interface AquaGamePlayFromDB {
  id: number
  music_id: number
  level: number
  play_count: number
  achievement: number
  combo_status: number
  sync_status: number
  deluxscore_max: number
  score_rank: number
  user_id: number
}

export interface AquaGamePlay {
  id: number
  music_id: number
  level: DifficultyEnum
  play_count: number
  achievement: number
  combo_status: number
  sync_status: number
  deluxscore_max: number
  score_rank: number
  user_id: number
  type: TypeEnum
}

const AQUA_GAME_PLAY_LEVEL_TO_DIFFICULTY: { [key: number]: DifficultyEnum } = {
  0: DifficultyEnum.Basic,
  1: DifficultyEnum.Advanced,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
}

export function readAquaGamePlays(db: sqljs.Database): AquaGamePlay[] {
  const results = db.exec('SELECT * FROM maimai2_user_music_detail')
  if (!results || results.length === 0) return []

  const records = convertQueryExecResultToEntries(results[0]) as AquaGamePlayFromDB[]

  return records.map((record) => ({
    ...record,
    level: AQUA_GAME_PLAY_LEVEL_TO_DIFFICULTY[record.level],
    type: record.music_id >= 10000 ? TypeEnum.DX : TypeEnum.STD,
  }))
}

export interface AquaPlayLogFromDB {
  id: number
  order_id: number
  playlog_id: number
  version: number
  place_id: number
  place_name: string
  login_date: number
  play_date: string
  user_play_date: string
  type: number
  music_id: number
  level: number
  track_no: number
  vs_mode: number
  vs_user_name: string
  vs_status: number
  vs_user_rating: number
  vs_user_achievement: number
  vs_user_grade_rank: number
  vs_rank: number
  player_num: number
  played_user_id1: number
  played_user_name1: string
  played_music_level1: number
  played_user_id2: number
  played_user_name2: string
  played_music_level2: number
  played_user_id3: number
  played_user_name3: string
  played_music_level3: number
  character_id1: number
  character_level1: number
  character_awakening1: number
  character_id2: number
  character_level2: number
  character_awakening2: number
  character_id3: number
  character_level3: number
  character_awakening3: number
  character_id4: number
  character_level4: number
  character_awakening4: number
  character_id5: number
  character_level5: number
  character_awakening5: number
  achievement: number
  deluxscore: number
  score_rank: number
  max_combo: number
  total_combo: number
  max_sync: number
  total_sync: number
  tap_critical_perfect: number
  tap_perfect: number
  tap_great: number
  tap_good: number
  tap_miss: number
  hold_critical_perfect: number
  hold_perfect: number
  hold_great: number
  hold_good: number
  hold_miss: number
  slide_critical_perfect: number
  slide_perfect: number
  slide_great: number
  slide_good: number
  slide_miss: number
  touch_critical_perfect: number
  touch_perfect: number
  touch_great: number
  touch_good: number
  touch_miss: number
  break_critical_perfect: number
  break_perfect: number
  break_great: number
  break_good: number
  break_miss: number
  is_tap: number
  is_hold: number
  is_slide: number
  is_touch: number
  is_break: number
  is_critical_disp: number
  is_fast_late_disp: number
  fast_count: number
  late_count: number
  is_achieve_new_record: number
  is_deluxscore_new_record: number
  combo_status: number
  sync_status: number
  is_clear: number
  before_rating: number
  after_rating: number
  before_grade: number
  after_grade: number
  after_grade_rank: number
  before_delux_rating: number
  after_delux_rating: number
  is_play_tutorial: number
  is_event_mode: number
  is_freedom_mode: number
  play_mode: number
  is_new_free: number
  ext_num1: number
  ext_num2: number
  user_id: number
  trial_play_achievement: number
}

interface NoteJudgementResult {
  have_any: boolean
  critical_perfect: number
  perfect: number
  great: number
  good: number
  miss: number
}

export interface AquaPlayLog {
  id: number
  order_id: number
  playlog_id: number
  version: number
  place_id: number
  place_name: string
  login_date: Date
  play_date: Date
  user_play_date: Date
  type: TypeEnum
  music_id: number
  level: DifficultyEnum
  track_no: number
  vs: {
    mode: number
    user_name: string
    status: number
    user_rating: number
    user_achievement: number
    user_grade_rank: number
    rank: number
  }
  player_num: number
  // played_user_id1: number;
  // played_user_name1: string;
  // played_music_level1: number;
  // played_user_id2: number;
  // played_user_name2: string;
  // played_music_level2: number;
  // played_user_id3: number;
  // played_user_name3: string;
  // played_music_level3: number;
  //
  // character_id1: number;
  // character_level1: number;
  // character_awakening1: number;
  // character_id2: number;
  // character_level2: number;
  // character_awakening2: number;
  // character_id3: number;
  // character_level3: number;
  // character_awakening3: number;
  // character_id4: number;
  // character_level4: number;
  // character_awakening4: number;
  // character_id5: number;
  // character_level5: number;
  // character_awakening5: number;
  achievement: number
  deluxscore: number
  score_rank: number
  max_combo: number
  total_combo: number
  max_sync: number
  total_sync: number

  note_judgement_results: {
    tap: NoteJudgementResult
    hold: NoteJudgementResult
    slide: NoteJudgementResult
    touch: NoteJudgementResult
    break: NoteJudgementResult
  }
  is_critical_disp: number
  is_fast_late_disp: number
  fast_count: number
  late_count: number
  is_achieve_new_record: number
  is_deluxscore_new_record: number
  combo_status: number
  sync_status: number
  is_clear: number
  before_rating: number
  after_rating: number
  before_grade: number
  after_grade: number
  after_grade_rank: number
  before_delux_rating: number
  after_delux_rating: number
  is_play_tutorial: number
  is_event_mode: number
  is_freedom_mode: number
  play_mode: number
  is_new_free: number
  // ext_num1: number;
  // ext_num2: number;
  user_id: number
  // trial_play_achievement: number;
}

export function readAquaPlayLogs(db: sqljs.Database): AquaPlayLog[] {
  const results = db.exec('SELECT * FROM maimai2_user_playlog')
  if (!results || results.length === 0) return []

  const records = convertQueryExecResultToEntries(results[0]) as AquaPlayLogFromDB[]

  return records.map((record) => ({
    id: record.id,
    order_id: record.order_id,
    playlog_id: record.playlog_id,
    version: record.version,
    place_id: record.place_id,
    place_name: record.place_name,
    login_date: new Date(record.login_date * 1000),
    play_date: new Date(record.play_date),
    user_play_date: new Date(record.user_play_date),
    level: AQUA_GAME_PLAY_LEVEL_TO_DIFFICULTY[record.level],
    type: record.music_id >= 10000 ? TypeEnum.DX : TypeEnum.STD,
    music_id: record.music_id,
    track_no: record.track_no,
    player_num: record.player_num,
    achievement: record.achievement,
    deluxscore: record.deluxscore,
    score_rank: record.score_rank,
    max_combo: record.max_combo,
    total_combo: record.total_combo,
    max_sync: record.max_sync,
    total_sync: record.total_sync,
    is_critical_disp: record.is_critical_disp,
    is_fast_late_disp: record.is_fast_late_disp,
    fast_count: record.fast_count,
    late_count: record.late_count,
    is_achieve_new_record: record.is_achieve_new_record,
    is_deluxscore_new_record: record.is_deluxscore_new_record,
    combo_status: record.combo_status,
    sync_status: record.sync_status,
    is_clear: record.is_clear,
    before_rating: record.before_rating,
    after_rating: record.after_rating,
    before_grade: record.before_grade,
    after_grade: record.after_grade,
    after_grade_rank: record.after_grade_rank,
    before_delux_rating: record.before_delux_rating,
    after_delux_rating: record.after_delux_rating,
    is_play_tutorial: record.is_play_tutorial,
    is_event_mode: record.is_event_mode,
    is_freedom_mode: record.is_freedom_mode,
    play_mode: record.play_mode,
    is_new_free: record.is_new_free,
    user_id: record.user_id,
    vs: {
      mode: record.vs_mode,
      user_name: record.vs_user_name,
      status: record.vs_status,
      user_rating: record.vs_user_rating,
      user_achievement: record.vs_user_achievement,
      user_grade_rank: record.vs_user_grade_rank,
      rank: record.vs_rank,
    },

    note_judgement_results: {
      tap: {
        have_any: record.is_tap === 1,
        critical_perfect: record.tap_critical_perfect,
        perfect: record.tap_perfect,
        great: record.tap_great,
        good: record.tap_good,
        miss: record.tap_miss,
      },
      hold: {
        have_any: record.is_hold === 1,
        critical_perfect: record.hold_critical_perfect,
        perfect: record.hold_perfect,
        great: record.hold_great,
        good: record.hold_good,
        miss: record.hold_miss,
      },
      slide: {
        have_any: record.is_slide === 1,
        critical_perfect: record.slide_critical_perfect,
        perfect: record.slide_perfect,
        great: record.slide_great,
        good: record.slide_good,
        miss: record.slide_miss,
      },
      touch: {
        have_any: record.is_touch === 1,
        critical_perfect: record.touch_critical_perfect,
        perfect: record.touch_perfect,
        great: record.touch_great,
        good: record.touch_good,
        miss: record.touch_miss,
      },
      break: {
        have_any: record.is_break === 1,
        critical_perfect: record.break_critical_perfect,
        perfect: record.break_perfect,
        great: record.break_great,
        good: record.break_good,
        miss: record.break_miss,
      },
    },
  }))
}
