import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  compact?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  interactive = false,
  compact = false,
  ...props
}) => {
  const baseStyle = [
    'flex flex-col',
    'bg-[var(--color-bg-surface)]',
    'border border-[var(--color-border)]',
    `rounded-[var(--card-radius)]`,
    `shadow-[var(--card-shadow)]`,
    `transition-[var(--card-transition)]`,
    'overflow-hidden', // Prevent content from breaking rounded corners
  ].join(' ')

  const hoverStyle = interactive ? [
    'hover:shadow-[var(--card-hover-shadow)]',
    'hover:border-[var(--color-primary)]',
    'cursor-pointer',
    'active:scale-[0.995]',
  ].join(' ') : ''

  const paddingStyle = compact ? `p-[var(--spacing-3)]` : `p-[var(--card-padding)]`

  return (
    <div
      className={`${baseStyle} ${paddingStyle} ${hoverStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`pb-[var(--card-header-spacing)] mb-[var(--card-header-spacing)] border-b border-[var(--color-border)] flex items-center justify-between gap-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`flex-1 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`pt-[var(--card-header-spacing)] mt-[var(--card-header-spacing)] border-t border-[var(--color-border)] flex items-center gap-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
