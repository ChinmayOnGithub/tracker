import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  icon?: React.ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon,
  className = '',
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  
  // Map variant styling using design tokens
  const variants = {
    primary: 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] active:scale-[0.98]',
    secondary: 'bg-[var(--color-accent)] text-[var(--color-text-main)] hover:opacity-90 active:scale-[0.98]',
    outline: 'border border-[var(--color-border)] bg-transparent text-[var(--color-text-main)] hover:bg-[var(--color-accent)] active:scale-[0.98]',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98]'
  }

  // Spacing grid sizing
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-[var(--radius-sm)] gap-1.5',
    md: 'px-4 py-2 text-sm rounded-[var(--radius-md)] gap-2',
    lg: 'px-6 py-3 text-base rounded-[var(--radius-lg)] gap-2.5'
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading && (
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
      {!isLoading && icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}
