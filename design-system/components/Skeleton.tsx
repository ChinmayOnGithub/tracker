import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'rect' | 'circle'
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect'
}) => {
  const baseStyle = 'animate-pulse bg-slate-200 dark:bg-zinc-800'
  
  const variants = {
    text: 'h-4 w-3/4 rounded-[var(--radius-sm)]',
    rect: 'rounded-[var(--radius-md)]',
    circle: 'rounded-full'
  }

  return (
    <div
      className={`${baseStyle} ${variants[variant]} ${className}`}
    />
  )
}

export const SkeletonWidget: React.FC = () => {
  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] p-4 flex flex-col gap-4 bg-[var(--color-bg-surface)]">
      {/* Title pulse */}
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" className="h-8 w-8" />
        <Skeleton variant="text" className="h-5 w-24" />
      </div>
      {/* Body content pulse */}
      <div className="flex flex-col gap-2.5">
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
        <Skeleton variant="rect" className="h-10 w-full" />
      </div>
    </div>
  )
}
