import React from 'react'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The icon to render inside the button */
  icon: React.ReactNode
  /** Accessible label — shown as title tooltip and used as aria-label */
  label: string
  /** Button size. 'sm' = 32px, 'md' = 36px, 'lg' = 44px */
  size?: 'sm' | 'md' | 'lg'
  /** Visual style variant */
  variant?: 'ghost' | 'outline' | 'primary' | 'danger'
  /** Disabled state */
  disabled?: boolean
  /** Loading state — replaces icon with spinner */
  isLoading?: boolean
}

const sizeClasses = {
  sm: 'w-8 h-8 rounded-[var(--radius-md)]',
  md: 'w-9 h-9 rounded-[var(--radius-lg)]',
  lg: 'w-11 h-11 rounded-[var(--radius-lg)]',
}

const iconSizeClasses = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

const variantClasses = {
  ghost:
    'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] active:scale-90',
  outline:
    'border border-[var(--color-border)] text-[var(--color-text-main)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-accent)] hover:border-[var(--color-primary)]/30 active:scale-90 shadow-xs',
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] active:scale-90 shadow-sm',
  danger:
    'text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 active:scale-90',
}

/**
 * IconButton
 * A square button containing only an icon. Provides consistent touch targets
 * (min 32px), accessible labels, and focus rings. Replaces all ad-hoc
 * raw `<button>` icon usages throughout the app.
 *
 * @example
 * <IconButton icon={<Plus />} label="Add task" size="md" onClick={handleAdd} />
 * <IconButton icon={<Trash2 />} label="Delete" variant="danger" size="sm" />
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  disabled = false,
  isLoading = false,
  type = 'button',
  className = '',
  ...props
}, ref) => {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || isLoading}
      className={[
        'inline-flex items-center justify-center shrink-0',
        'transition-all duration-[var(--motion-duration-fast)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50 focus-visible:ring-offset-1',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        sizeClasses[size],
        variantClasses[variant],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {isLoading ? (
        <svg
          className={`animate-spin ${iconSizeClasses[size]}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <span className={iconSizeClasses[size]} aria-hidden="true">
          {icon}
        </span>
      )}
    </button>
  )
})
IconButton.displayName = 'IconButton'
