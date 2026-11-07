/**
 * Runs a task in the task after the next paint, and returns a function that cancels it.
 *
 * For work an interaction starts but need not finish before it paints, such as a navigation that re-renders the
 * whole route: run in the event, it holds the interaction's paint back (mobile INP). `setTimeout` alone can run
 * before that paint.
 */
export const afterNextPaint = (task: () => void): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  if (typeof requestAnimationFrame !== 'function') {
    timer = setTimeout(task)
    return () => clearTimeout(timer)
  }
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(task)
  })
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
  }
}