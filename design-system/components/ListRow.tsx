import React from 'react'

interface ListRowProps {
  /** Left slot — checkbox, icon, avatar, or color dot */
  left?: React.ReactNode
  /** Primary row title */
  title: React.ReactNode
  /** Optional subtitle / meta line */
  subtitle?: React.ReactNode
  /** Right-side slot — status badge, actions menu, timestamp */
  right?: React.ReactNode
  /** Row click handler. Omit to make the row non-interactive */
  onClick?: () => void
  /** Apply strikethrough style to the title (completed items) */
  strikethrough?: boolean
  /** Reduce opacity (canceled, postponed) */
  dimmed?: boolean
  /** Enable drag-to-reorder — renders a grip handle on hover */
  draggable?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void
  /** Left-side colored accent strip (pass a Tailwind bg class e.g. 'bg-blue-500') */
  accentColor?: string
  /** Additional classes for the outer wrapper */
  className?: string
  /** Whether this row is currently selected */
  selected?: boolean
}

/**
 * ListRow
 * The canonical list item row. Handles the left slot, title, subtitle,
 * right slot, hover state, accent strip, and drag handle consistently.
 * Use this for task rows, activity rows, journal entries, vault items, etc.
 *
 * @example
 * <ListRow
 *   left={<Checkbox checked={done} />}
 *   title="Morning Run"
 *   subtitle="Daily · 30 min"
 *   right={<StatusBadge status="done" />}
 *   accentColor="bg-green-500"
 *   strikethrough={done}
 *   onClick={() => cycleStatus(item)}
 * />
 */
export const ListRow: React.FC<ListRowProps> = ({
  left,
  title,
  subtitle,
  right,
  onClick,
  strikethrough = false,
  dimmed = false,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  accentColor,
  className = '',
  selected = false,
}) => {
  const isInteractive = !!onClick

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }
          : undefined
      }
      className={[
        'relative flex items-center gap-3 px-3 py-2.5',
        'transition-colors duration-[var(--motion-duration-fast)]',
        'border-b border-[var(--color-border)]/40 last:border-b-0',
        isInteractive ? 'cursor-pointer hover:bg-[var(--color-accent)]' : '',
        selected ? 'bg-[var(--color-primary)]/5' : '',
        dimmed ? 'opacity-45' : '',
        'group',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Left accent color strip */}
      {accentColor && (
        <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${accentColor}`} />
      )}

      {/* Left slot */}
      {left && (
        <div className="shrink-0 flex items-center justify-center">
          {left}
        </div>
      )}

      {/* Title + Subtitle */}
      <div className="flex-1 min-w-0">
        <div
          className={[
            'text-xs font-semibold leading-snug truncate',
            'text-[var(--color-text-main)]',
            strikethrough ? 'line-through text-[var(--color-text-muted)]' : '',
          ].filter(Boolean).join(' ')}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-snug truncate font-normal">
            {subtitle}
          </div>
        )}
      </div>

      {/* Right slot */}
      {right && (
        <div className="shrink-0 flex items-center gap-1.5">
          {right}
        </div>
      )}

      {/* Drag handle — shown on hover when draggable */}
      {draggable && (
        <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-duration-fast)] cursor-grab active:cursor-grabbing text-[var(--color-text-muted)] ml-1">
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="4" cy="3" r="1.5" fill="currentColor" />
            <circle cx="8" cy="3" r="1.5" fill="currentColor" />
            <circle cx="4" cy="8" r="1.5" fill="currentColor" />
            <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            <circle cx="4" cy="13" r="1.5" fill="currentColor" />
            <circle cx="8" cy="13" r="1.5" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  )
}
