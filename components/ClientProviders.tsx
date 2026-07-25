'use client'

import { ToastProvider } from '@/design-system/components/Toast'
import { StoreProvider } from '@/lib/store/store'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </StoreProvider>
  )
}

