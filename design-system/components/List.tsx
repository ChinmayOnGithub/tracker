import React from 'react'

export interface ListProps extends React.HTMLAttributes<HTMLDivElement> {
  compact?: boolean
  divided?: boolean
}

export const List = React.forwardRef<HTMLDivElement, ListProps>(({
  children,
  compact = false,
  divided = true,
  className = '',
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      role="list"
      className={[
        'flex flex-col w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden',
        divided ? 'divide-y divide-[var(--border)]' : '',
        compact ? 'gap-0' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
})
List.displayName = 'List'

export interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  active?: boolean
  disabled?: boolean
}

export const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(({
  children,
  interactive = false,
  active = false,
  disabled = false,
  className = '',
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      role="listitem"
      className={[
        'flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition-colors duration-150',
        active ? 'bg-[var(--accent)] font-medium text-[var(--foreground)]' : 'text-[var(--foreground)]',
        interactive && !disabled
          ? 'cursor-pointer hover:bg-[var(--accent)] active:bg-[var(--surface-muted)]'
          : '',
        disabled ? 'opacity-50 pointer-events-none' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
})
ListItem.displayName = 'ListItem'

export const ListItemLeading = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={`shrink-0 flex items-center justify-center text-[var(--muted-foreground)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
})
ListItemLeading.displayName = 'ListItemLeading'

export const ListItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={`flex-1 min-w-0 flex flex-col gap-0.5 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
})
ListItemContent.displayName = 'ListItemContent'

export const ListItemTrailing = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={`shrink-0 flex items-center gap-2 text-xs text-[var(--muted-foreground)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
})
ListItemTrailing.displayName = 'ListItemTrailing'
