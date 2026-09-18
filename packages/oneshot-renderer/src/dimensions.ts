export const ONESHOT_WIDTH = 1500
export const ONESHOT_HEIGHT = 1300

export const normalizeWidth = (width: number = ONESHOT_WIDTH) =>
  Number.isFinite(width) && width >= 1 && width <= 3000 ? Math.trunc(width) : ONESHOT_WIDTH