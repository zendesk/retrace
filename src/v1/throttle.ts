/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-spread */
export const throttle = <Args extends any[]>(
  func: (...args: Args) => any,
  waitFor: number,
): ((...args: Args) => void) => {
  let previouslyRun: number
  let queuedToRun: ReturnType<typeof setTimeout>

  return function invokeFn(...args: Args) {
    const now = Date.now()

    clearTimeout(queuedToRun)
    if (!previouslyRun || now - previouslyRun >= waitFor) {
      func.apply(null, args)
      previouslyRun = now
    } else {
      queuedToRun = setTimeout(
        () => void invokeFn(...args),
        waitFor - (now - previouslyRun),
      )
    }
  }
}
