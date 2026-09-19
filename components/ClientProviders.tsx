'use client'

import { ToastProvider } from '@/design-system/components/Toast'
import { StoreProvider } from '@/lib/store/store'
import { Toaster } from 'sonner'

interface ClientProvidersProps {
  children: React.ReactNode
  /**
   * The authenticated user's ID, read from the server-side session cookie.
   * Used as a React key for StoreProvider to force a full remount (and thus a
   * complete in-memory state reset) whenever the authenticated identity changes —
   * i.e., on logout, login as a different user, or session expiry.
   *
   * This is the canonical client-state isolation boundary for #57:
   * - User A logs in → StoreProvider mounts with key=A's userId
   * - User A logs out → next render has key=null → React destroys the A-keyed
   *   StoreProvider tree and mounts a fresh guest-keyed instance
   * - User B logs in → key=B's userId → fresh instance, no A data
   *
   * IMPORTANT: This is NOT authentication authority — the userId is only used
   * for React's reconciliation key. All authorization remains server-side.
   */
  userId?: string | null
}

export default function ClientProviders({ children, userId }: ClientProvidersProps) {
  // Using a stable string key: authenticated userId, or 'guest' when no session.
  // Any change to the key causes React to unmount + remount the entire subtree,
  // which resets StoreProvider's useState(defaultState), clears all React context
  // derived from it, and cancels all pending useEffect callbacks.
  const storeKey = userId ?? 'guest'

  return (
    <StoreProvider key={storeKey} userId={userId}>
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
