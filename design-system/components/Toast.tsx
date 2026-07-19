'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  message: string
  description?: string
  variant: ToastVariant
  duration?: number
}

interface ToastContextValue {
  toasts: ToastItem[]
  toast: (message: string, opts?: Partial<Omit<ToastItem, 'id' | 'message'>>) => void
  dismiss: (id: string) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((
    message: string,
    opts: Partial<Omit<ToastItem, 'id' | 'message'>> = {}
  ) => {
    const id = crypto.randomUUID()
    const variant = opts.variant ?? 'info'
    const duration = opts.duration ?? 4000

    setToasts(prev => [...prev, { id, message, variant, duration, ...opts }])

    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// ─── Toast Styling ────────────────────────────────────────────────────────────

const variantConfig: Record<ToastVariant, { bar: string; icon: React.ReactNode }> = {
  success: {
    bar: 'bg-[var(--color-completed)]',
    icon: (
      <svg className="w-4 h-4 text-[var(--color-completed)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    bar: 'bg-[var(--color-overdue)]',
    icon: (
      <svg className="w-4 h-4 text-[var(--color-overdue)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  warning: {
    bar: 'bg-[var(--color-warning)]',
    icon: (
      <svg className="w-4 h-4 text-[var(--color-warning)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  info: {
    bar: 'bg-[var(--color-primary)]',
    icon: (
      <svg className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
}

// ─── Viewport (renders portal-like fixed bottom-right area) ───────────────────

function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: ToastItem[]
  dismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
    >
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  )
}

// ─── Individual Toast Card ────────────────────────────────────────────────────

function ToastCard({ toast: t, dismiss }: { toast: ToastItem; dismiss: (id: string) => void }) {
  const { bar, icon } = variantConfig[t.variant]

  return (
    <div
      role="alert"
      className={`
        relative overflow-hidden flex items-start gap-3 p-3.5 pr-8
        bg-[var(--color-bg-surface)]
        border border-[var(--color-border)]
        rounded-[var(--radius-lg)]
        shadow-[var(--card-hover-shadow)]
        text-sm
        animate-in slide-in-from-bottom-2 fade-in-0
        duration-[var(--motion-duration-normal)]
      `}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} />

      {/* Icon */}
      <div className="mt-0.5">{icon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--color-text-main)] leading-snug">{t.message}</p>
        {t.description && (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)] leading-snug">{t.description}</p>
        )}
      </div>

      {/* Dismiss */}
      <button
        aria-label="Dismiss notification"
        onClick={() => dismiss(t.id)}
        className={`
          absolute top-2 right-2 p-1 rounded-full
          text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]
          hover:bg-[var(--color-accent)]
          transition-colors duration-[var(--motion-duration-fast)]
        `}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
