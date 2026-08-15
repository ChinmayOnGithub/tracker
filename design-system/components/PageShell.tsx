'use client'

import React from 'react'
import { PageContainer } from './PageContainer'
import { PageHeader } from './PageHeader'
import { Skeleton } from './Skeleton'

interface PageShellProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  prefix?: React.ReactNode
  maxWidth?: 'default' | 'wide' | 'narrow'
  isLoading?: boolean
  error?: string | null
  children: React.ReactNode
}

export const PageShell: React.FC<PageShellProps> = ({
  title,
  subtitle,
  actions,
  prefix,
  maxWidth = 'default',
  isLoading = false,
  error = null,
  children,
}) => {
  return (
    <PageContainer maxWidth={maxWidth}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={actions}
        prefix={prefix}
      />
      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-[var(--color-overdue)] rounded-[var(--radius-lg)] text-sm font-medium">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        children
      )}
    </PageContainer>
  )
}
