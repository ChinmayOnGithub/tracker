import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'warning'
  size?: 'sm' | 'md' | 'lg' | 'icon-sm'
  isLoading?: boolean
  loading?: boolean
  icon?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loading = false,
  disabled = false,
  icon,
  className = '',
  ...props
}) => {
  const isLoadingState = isLoading || loading
  const baseStyle = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  
  // Map variant styling using design tokens
  const variants = {
    primary: 'bg-[var(--color-primary)] text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_12px_rgba(99,102,241,0.4)] hover:bg-[var(--color-primary-hover)] active:scale-[0.97]',
    secondary: 'bg-[var(--color-accent)] text-[var(--color-text-main)] shadow-sm hover:shadow-md hover:bg-[var(--color-accent)]/80 active:scale-[0.97]',
    outline: 'border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] shadow-sm hover:shadow hover:bg-[var(--color-accent)] active:scale-[0.97]',
    danger: 'bg-rose-600 text-white shadow-[0_2px_8px_rgba(225,29,72,0.25)] hover:shadow-[0_4px_12px_rgba(225,29,72,0.4)] hover:bg-rose-500 active:scale-[0.97]',
    ghost: 'bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-main)] active:scale-[0.97]',
    warning: 'bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_12px_rgba(245,158,11,0.4)] hover:bg-amber-400 active:scale-[0.97]'
  }

  // Spacing grid sizing
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-[var(--radius-sm)] gap-2',
    md: 'px-4 py-2 text-sm rounded-[var(--radius-md)] gap-2.5',
    lg: 'px-6 py-3 text-base rounded-[var(--radius-lg)] gap-3',
    'icon-sm': 'p-1.5 rounded-lg'
  }

  return (
    <button
      disabled={disabled || isLoadingState}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoadingState && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
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
    </button>
  )
}
