"use client"

/**
 * GridWidgetWrapper
 * Wraps individual widgets within the Today grid.
 * Handles drag handles, resize edges/corners, and edit mode chrome and actions.
 */

import React, { useRef } from 'react'
import { GripVertical, EyeOff } from 'lucide-react'
import { WidgetLayoutItem } from '@/lib/dashboard/types'
import { getWidgetDefinition } from '@/lib/dashboard/registry'

interface GridWidgetWrapperProps {
  item: WidgetLayoutItem
  isEditing: boolean
  children: React.ReactNode
  onHideWidget?: (id: string) => void
  onDragStart?: (e: React.PointerEvent, item: WidgetLayoutItem) => void
  onResizeStart?: (e: React.PointerEvent, item: WidgetLayoutItem, direction: 'se' | 'e' | 's') => void
  className?: string
  isDragging?: boolean
  isResizing?: boolean
}

export const GridWidgetWrapper: React.FC<GridWidgetWrapperProps> = ({
  item,
  isEditing,
  children,
  onHideWidget,
  onDragStart,
  onResizeStart,
  className = '',
  isDragging = false,
  isResizing = false,
}) => {
  const def = getWidgetDefinition(item.id)
  const wrapperRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={wrapperRef}
      data-widget-id={item.id}
      className={`relative group rounded-[var(--radius-lg)] transition-all select-none bg-[var(--color-bg-surface)] border ${
        isEditing
          ? isDragging
            ? 'border-[var(--color-primary)] shadow-2xl opacity-90 z-30 ring-2 ring-[var(--color-primary)]/30 scale-[1.01]'
            : isResizing
            ? 'border-[var(--color-primary)] shadow-lg z-20 ring-1 ring-[var(--color-primary)]/20'
            : 'border-dashed border-[var(--color-primary)]/40 hover:border-[var(--color-primary)] shadow-sm'
          : 'border-[var(--color-border)] shadow-[var(--card-shadow)] hover:shadow-[var(--card-hover-shadow)]'
      } ${className} flex flex-col overflow-hidden`}
    >
      {/* Widget Header Bar (in Edit Mode: shows drag handle and badge; in Normal Mode: if not tasks widget, shows clean subtle card bar or allows widget header) */}
      {isEditing ? (
        <div
          onPointerDown={(e) => {
            const target = e.target as HTMLElement
            if (target.closest('button:not([data-drag-handle="true"])')) return
            onDragStart?.(e, item)
          }}
          className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border)] shrink-0 cursor-grab active:cursor-grabbing text-xs text-[var(--color-text-muted)]"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              data-drag-handle="true"
              aria-label="Drag widget"
              className="p-1 hover:text-[var(--color-text-main)] rounded cursor-grab active:cursor-grabbing text-[var(--color-text-muted)]"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <span className="font-semibold text-[11px] text-[var(--color-text-main)] truncate">
              {def?.title || item.id}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono ml-1 shrink-0 bg-[var(--color-bg-base)] px-1.5 py-0.5 rounded border border-[var(--color-border)]/50">
              {item.w}×{item.h}
            </span>
          </div>

          {onHideWidget && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onHideWidget(item.id)
              }}
              title="Hide widget from dashboard"
              className="p-1 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : null}

      {/* Widget Body Content */}
      <div className={`w-full flex-1 min-h-0 ${item.id === 'tasks' ? 'flex flex-col p-0 overflow-hidden' : `overflow-y-auto ${item.h <= 3 ? 'p-2' : 'p-3'}`} ${isDragging ? 'pointer-events-none' : ''}`}>
        {children}
      </div>

      {/* Resize Handles (Only in Edit Mode) */}
      {isEditing && (
        <>
          {/* Resize Handle (Bottom-Right SE corner) */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation()
              onResizeStart?.(e, item, 'se')
            }}
            title="Drag to resize widget"
            className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)] z-10 transition-colors"
          >
            <svg viewBox="0 0 6 6" className="w-2.5 h-2.5 fill-current">
              <circle cx="5" cy="1" r="0.75" />
              <circle cx="5" cy="5" r="0.75" />
              <circle cx="1" cy="5" r="0.75" />
            </svg>
          </div>

          {/* Horizontal Resize Handle (Right edge) */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation()
              onResizeStart?.(e, item, 'e')
            }}
            title="Resize width"
            className="absolute right-0 top-10 bottom-4 w-2 cursor-e-resize hover:bg-[var(--color-primary)]/20 z-10 transition-colors"
          />

          {/* Vertical Resize Handle (Bottom edge) */}
          <div
            onPointerDown={(e) => {
              e.stopPropagation()
              onResizeStart?.(e, item, 's')
            }}
            title="Resize height"
            className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize hover:bg-[var(--color-primary)]/20 z-10 transition-colors"
          />
        </>
      )}
    </div>
  )
}
