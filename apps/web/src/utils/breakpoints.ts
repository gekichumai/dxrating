import { createBreakpoint } from 'react-use'

const useBreakpointClient = createBreakpoint({
  mobile: 0,
  large: 768,
})

export const useBreakpoint = () => {
  if (typeof window === 'undefined') return 'mobile' as const
  return useBreakpointClient()
}

export const useIsLargeDevice = () => {
  const breakpoint = useBreakpoint()
  return breakpoint === 'large'
}