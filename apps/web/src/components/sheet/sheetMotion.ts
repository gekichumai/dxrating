/**
 * Motion for chips and small controls entering and leaving inside the sheet views. Opacity carries the change; the
 * 0.96 scale is dropped under reduced motion by the app-wide MotionConfig, so those users get a plain fade.
 */
export const chipPresenceTransitions = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15, ease: [0.2, 0, 0, 1] as const } },
  transition: { type: 'spring' as const, duration: 0.3, bounce: 0 },
}

/** State changes inside the sheet header (favourite star, cover size): a critically damped spring, no overshoot */
export const sheetStateSpring = { type: 'spring' as const, duration: 0.3, bounce: 0 }