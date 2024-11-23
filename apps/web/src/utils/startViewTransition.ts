export const startViewTransition = (cb: () => void | Promise<void>) => {
  if (document.startViewTransition) {
    document.startViewTransition(cb)
  } else {
    cb()
  }
}
