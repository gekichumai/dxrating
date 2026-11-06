import { type ComponentPropsWithoutRef, type ElementType, forwardRef } from 'react'

type MaterialSurfaceProps = ComponentPropsWithoutRef<'div'> & {
  /** `thin` is lighter, for surfaces nested on another material */
  variant?: 'regular' | 'thin'
  as?: ElementType
}

/**
 * A translucent material surface: backdrop blur, translucency and a subtle border, 12px radius, light and dark.
 * Use instead of flat solid backgrounds. Also available as the `material-surface` UnoCSS shortcut.
 */
export const MaterialSurface = forwardRef<HTMLDivElement, MaterialSurfaceProps>(
  ({ variant = 'regular', as: Component = 'div', className, ...props }, ref) => (
    <Component
      ref={ref}
      className={`${variant === 'thin' ? 'material-surface-thin' : 'material-surface'} ${className ?? ''}`}
      {...props}
    />
  ),
)
MaterialSurface.displayName = 'MaterialSurface'