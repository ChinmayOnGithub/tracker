import React from 'react'

export interface SkeletonProps {
  className?: string
  variant?: 'text' | 'rect' | 'circle'
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect'
}) => {
  const baseStyle = 'animate-pulse bg-slate-200/80 dark:bg-zinc-800/80'

  const variants = {
    text: 'h-4 w-3/4 rounded-[var(--radius-sm)]',
    rect: 'rounded-[var(--radius-md)]',
    circle: 'rounded-full'
  }

  return (
    <div
      aria-hidden="true"
      className={`${baseStyle} ${variants[variant]} ${className}`}
    />
  )
}

export const SkeletonWidget: React.FC = () => {
  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-4 flex flex-col gap-4 bg-[var(--surface)]">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="h-8 w-8" />
        <Skeleton variant="text" className="h-5 w-24" />
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
      </div>
    </div>
  )
}

export const PageSkeleton: React.FC = () => {
  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div className="space-y-1.5 w-1/3">
          <Skeleton className="h-7 w-48 rounded-[var(--radius-sm)]" />
          <Skeleton className="h-4 w-64 rounded-[var(--radius-sm)]" />
        </div>
        <Skeleton className="h-9 w-28 rounded-[var(--radius-md)]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-36 col-span-2 rounded-[var(--radius-md)]" />
        <Skeleton className="h-36 rounded-[var(--radius-md)]" />
      </div>
      <Skeleton className="h-64 w-full rounded-[var(--radius-md)]" />
    </div>
  )
}

export const SectionSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <Skeleton className="h-4 w-32 rounded-[var(--radius-sm)]" />
        <Skeleton className="h-6 w-16 rounded-[var(--radius-sm)]" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-12 w-full rounded-[var(--radius-md)]" />
        <Skeleton className="h-12 w-full rounded-[var(--radius-md)]" />
        <Skeleton className="h-12 w-full rounded-[var(--radius-md)]" />
      </div>
    </div>
  )
}

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--surface)]"
        >
          <Skeleton variant="circle" className="h-7 w-7 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3 rounded-[var(--radius-sm)]" />
            <Skeleton className="h-3 w-1/2 rounded-[var(--radius-sm)]" />
          </div>
          <Skeleton className="h-6 w-14 rounded-[var(--radius-sm)] shrink-0" />
        </div>
      ))}
    </div>
  )
}

export const CardSkeleton: React.FC = () => {
  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-4 flex flex-col gap-3 bg-[var(--surface)]">
      <Skeleton className="h-5 w-1/3 rounded-[var(--radius-sm)]" />
      <Skeleton className="h-20 w-full rounded-[var(--radius-sm)]" />
      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
        <Skeleton className="h-8 w-20 rounded-[var(--radius-sm)]" />
      </div>
    </div>
  )
}

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 4, cols = 4 }) => {
  return (
    <div className="w-full border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden bg-[var(--surface)]">
      <div className="flex items-center gap-4 p-3 bg-[var(--surface-muted)] border-b border-[var(--border)]">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1 rounded-[var(--radius-sm)]" />
        ))}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 p-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1 rounded-[var(--radius-sm)]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
