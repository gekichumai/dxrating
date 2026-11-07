import type { PropsWithChildren } from 'react'

/**
 * The floating notices of every page (announcements, the version-update prompt), stacked bottom-start above the safe
 * area. Floating rather than in the flow, so a notice that appears after hydration moves nothing on the page. The
 * stack itself lets clicks through; its cards take them. It never grows past the viewport: long notices scroll inside
 * it, starting from the first (most severe) one, so every heading and close button stays reachable.
 */
export function NoticeStack({ children }: PropsWithChildren) {
  return (
    <div className="pointer-events-none fixed z-[1100] bottom-[calc(env(safe-area-inset-bottom)+1rem)] start-4 end-4 md:end-auto md:w-[26rem] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] overflow-y-auto overscroll-contain flex flex-col gap-2 empty:hidden [&>*]:pointer-events-auto [&>*]:shrink-0">
      {children}
    </div>
  )
}