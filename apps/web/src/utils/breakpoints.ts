import { createBreakpoint } from 'react-use'

export const useBreakpoint = createBreakpoint({
  mobile: 0,
  large: 768,
})

export const useIsLargeDevice = () => {
  const breakpoint = useBreakpoint()
  return breakpoint === 'large'
}
