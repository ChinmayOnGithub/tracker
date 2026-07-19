'use client'

import { ToastProvider } from '@/design-system/components/Toast'

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
