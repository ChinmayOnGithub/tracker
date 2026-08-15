'use client'

import { ToastProvider } from '@/design-system/components/Toast'
import { StoreProvider } from '@/lib/store/store'
import { Toaster } from 'sonner'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
      {/* Sonner — Tracker notification abstraction (lib/notifications.ts) */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-main)',
            borderRadius: 'var(--radius-lg)',
            fontSize: '13px',
          },
        }}
        richColors
      />
    </StoreProvider>
  )
}


