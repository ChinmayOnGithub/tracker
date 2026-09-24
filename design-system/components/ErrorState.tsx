import React from 'react'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Button } from './Button'

export interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  compact?: boolean
  className?: string
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  compact = false,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={[
        'flex flex-col items-center justify-center text-center',
        'border border-[var(--destructive)]/20 bg-[var(--destructive)]/5 rounded-[var(--radius-lg)]',
        compact ? 'p-4 gap-2.5' : 'p-8 gap-4',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--destructive)]/10 text-[var(--destructive)] shrink-0">
        <AlertCircle size={20} />
      </div>

      <div className="flex flex-col gap-1 max-w-sm">
        <h4 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
          {title}
        </h4>
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
          {message}
        </p>
      </div>

      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export interface InlineErrorProps {
  message: string
  className?: string
}

export const InlineError: React.FC<InlineErrorProps> = ({ message, className = '' }) => {
  if (!message) return null
  return (
    <div
      role="alert"
      className={`inline-flex items-center gap-1.5 text-xs text-[var(--destructive)] font-medium ${className}`}
    >
      <AlertTriangle size={13} className="shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export interface FormErrorProps {
  message?: string
  className?: string
}

export const FormError: React.FC<FormErrorProps> = ({ message, className = '' }) => {
  if (!message) return null
  return (
    <p
      role="alert"
      className={`text-xs text-[var(--destructive)] font-medium mt-1 leading-normal ${className}`}
    >
      {message}
    </p>
  )
}
