const SCORE_COEFFICIENT_TABLE: [number, number, string][] = [
  [0, 0, "d"],
  [50, 8, "c"],
  [60, 9.6, "b"],
  [70, 11.2, "bb"],
  [75, 12.0, "bbb"],
  [80, 13.6, "a"],
  [90, 15.2, "aa"],
  [94, 16.8, "aaa"],
  [97, 20, "s"],
  [98, 20.3, "sp"],
  [99, 20.8, "ss"],
  [99.5, 21.1, "ssp"],
  [100, 21.6, "sss"],
  [100.5, 22.4, "sssp"],
];

export interface Rating {
  ratingAwardValue: number;
  coefficient: number;
  rank: string | null;
  index: number;
}

export const calculateRating = (
  internalLevel: number,
  achievementRate: number,
): Rating => {
  for (let i = 0; i < SCORE_COEFFICIENT_TABLE.length; i++) {
    if (
      i === SCORE_COEFFICIENT_TABLE.length - 1 ||
      achievementRate < SCORE_COEFFICIENT_TABLE[i + 1][0]
    ) {
      const coefficient = SCORE_COEFFICIENT_TABLE[i][1];
      return {
        ratingAwardValue: Math.floor(
          (coefficient * internalLevel * Math.min(100.5, achievementRate)) /
            100,
        ),
        coefficient,
        rank: SCORE_COEFFICIENT_TABLE[i][2],
        index: i,
      };
    }
  }

  return {
    ratingAwardValue: 0,
    coefficient: 0,
    rank: "d",
    index: 99,
  };
};
