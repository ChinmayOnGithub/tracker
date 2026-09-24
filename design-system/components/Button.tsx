import React from 'react'
import { Slot } from '@radix-ui/react-slot'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'destructive'
  | 'danger'
  | 'ghost'
  | 'warning'
  | 'link'

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  loading?: boolean
  icon?: React.ReactNode
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loading = false,
  disabled = false,
  icon,
  className = '',
  asChild = false,
  ...props
}, ref) => {
  const isLoadingState = isLoading || loading
  const baseStyle = 'inline-flex items-center justify-center font-medium transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none'

  // Semantic token-based variants
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] shadow-xs active:scale-[0.98]',
    secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--secondary-hover)] border border-[var(--border-subtle)] shadow-xs active:scale-[0.98]',
    outline: 'border border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-[var(--accent)] shadow-xs active:scale-[0.98]',
    destructive: 'bg-[var(--destructive)] text-white hover:bg-[var(--destructive-hover)] shadow-xs active:scale-[0.98]',
    danger: 'bg-[var(--destructive)] text-white hover:bg-[var(--destructive-hover)] shadow-xs active:scale-[0.98]',
    ghost: 'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] active:scale-[0.98]',
    warning: 'bg-[var(--warning)] text-white hover:opacity-90 shadow-xs active:scale-[0.98]',
    link: 'bg-transparent text-[var(--primary)] underline-offset-4 hover:underline p-0 h-auto font-normal',
  }

  // Normalized size scale
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 py-1 text-xs rounded-[var(--radius-sm)] gap-1.5',
    md: 'h-9 px-4 py-2 text-sm rounded-[var(--radius-md)] gap-2',
    lg: 'h-10 px-5 py-2.5 text-base rounded-[var(--radius-lg)] gap-2.5',
    icon: 'h-8 w-8 p-1.5 rounded-[var(--radius-md)] shrink-0',
    'icon-sm': 'h-8 w-8 p-1.5 rounded-[var(--radius-md)] shrink-0',
  }

  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      disabled={disabled || isLoadingState}
      data-tracker-control="button"
      data-tracker-size={size}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoadingState && (
        <svg
          className="animate-spin -ml-0.5 mr-2 h-3.5 w-3.5 text-current shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!isLoadingState && icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </Comp>
  )
})
Button.displayName = 'Button'
