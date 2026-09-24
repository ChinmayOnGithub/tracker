import React from 'react'

export type SurfaceVariant = 'flat' | 'subtle' | 'interactive' | 'raised' | 'floating'

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant
  compact?: boolean
  as?: React.ElementType
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(({
  children,
  className = '',
  variant = 'flat',
  compact = false,
  as: Component = 'div',
  ...props
}, ref) => {
  const baseStyle = 'flex flex-col rounded-[var(--radius-md)] overflow-hidden transition-[var(--card-transition)]'

  const variantStyles: Record<SurfaceVariant, string> = {
    flat: 'bg-transparent border border-[var(--border)] shadow-[var(--elevation-flat)]',
    subtle: 'bg-[var(--surface-muted)] border border-[var(--border-subtle)] shadow-[var(--elevation-surface)]',
    interactive: 'bg-[var(--surface)] border border-[var(--border)] shadow-[var(--elevation-surface)] hover:shadow-[var(--elevation-raised)] hover:border-[var(--primary)] cursor-pointer active:scale-[0.995]',
    raised: 'bg-[var(--surface)] border border-[var(--border)] shadow-[var(--elevation-raised)]',
    floating: 'bg-[var(--surface)] border border-[var(--border)] shadow-[var(--elevation-floating)]',
  }

  const paddingStyle = compact ? 'p-3' : 'p-4'

  return (
    <Component
      ref={ref}
      className={`${baseStyle} ${variantStyles[variant]} ${paddingStyle} ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
})
Surface.displayName = 'Surface'

export const SurfaceHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`pb-3 mb-3 border-b border-[var(--border)] flex items-center justify-between gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
SurfaceHeader.displayName = 'SurfaceHeader'

export const SurfaceContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div className={`flex-1 min-w-0 ${className}`} {...props}>
      {children}
    </div>
  )
}
SurfaceContent.displayName = 'SurfaceContent'

export const SurfaceFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`pt-3 mt-3 border-t border-[var(--border)] flex items-center justify-between gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
SurfaceFooter.displayName = 'SurfaceFooter'
