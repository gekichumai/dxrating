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
    type: 'spring',
    stiffness: 500,
    damping: 30,
  },
}
