export const zoomTransitions = {
  exit: {
    scale: 0.9,
  },
  initial: {
    scale: 0,
  },
  animate: {
    scale: 1,
  },
  transition: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 30,
  },
}