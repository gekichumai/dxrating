export const calculateDXScoreStars = (achieved: number, total: number): number => {
  const percentage = achieved / total

  if (percentage >= 0.97) {
    return 5
  } else if (percentage >= 0.95) {
    return 4
  } else if (percentage >= 0.93) {
    return 3
  } else if (percentage >= 0.9) {
    return 2
  } else if (percentage >= 0.85) {
    return 1
  } else {
    return 0
  }
}
