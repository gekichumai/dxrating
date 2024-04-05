import { Flag } from ".";

export interface AchievementRecord {
  sheet: {
    songId: string;
    type: string;
    difficulty: string;
  };
  achievement: {
    rate: number;
    dxScore: {
      achieved: number;
      total: number;
    };
    flags: Flag[];
  };
}

export type MusicRecord = AchievementRecord;
export type RecentRecord = AchievementRecord & {
  play: {
    track: number;
    timestamp?: string;
  };
};
