export const calculateDXScoreStars = (achieved: number, total: number): number => {
  const percentage = achieved / total

  if (percentage >= 0.97) {
    return 5
  }
  if (percentage >= 0.95) {
    return 4
  }
  if (percentage >= 0.93) {
    return 3
  }
  if (percentage >= 0.9) {
    return 2
  }
  if (percentage >= 0.85) {
    return 1
  }
  return 0
}
