"use client"

/**
 * SortableList — Shared dnd-kit vertical sortable container.
 * Reusable across Today, Activities, and Customizers without redundant implementations.
 */

import React, { useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

// ─── Sortable Item Wrapper ───────────────────────────────────────────────────

export interface SortableItemProps {
  id: string
  children: React.ReactNode
  disabled?: boolean
}

export function SortableItem({ id, children, disabled }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    position: 'relative',
  }

  return (
    <div ref={setNodeRef} style={style}>
      {React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          _dragHandleRef: setActivatorNodeRef,
          _dragHandleListeners: listeners,
          _dragHandleAttributes: attributes,
        })
      })}
    </div>
  )
}

// ─── Drag Handle Widget ──────────────────────────────────────────────────────

export interface DragHandleProps {
  dragHandleRef?: (el: HTMLElement | null) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleListeners?: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleAttributes?: Record<string, any>
  className?: string
}

export function DragHandle({
  dragHandleRef,
  dragHandleListeners,
  dragHandleAttributes,
  className = '',
}: DragHandleProps) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  return (
    <button
      ref={dragHandleRef}
      {...(mounted ? dragHandleListeners : {})}
      {...(mounted ? dragHandleAttributes : {})}
      type="button"
      aria-label="Drag to reorder"
      className={[
        'shrink-0 w-5 h-full flex items-center justify-center',
        'text-[var(--color-border)] hover:text-[var(--color-text-muted)]',
        'transition-colors duration-[var(--motion-duration-fast)]',
        'cursor-grab active:cursor-grabbing',
        'touch-none',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/50 rounded-sm',
        className,
      ].join(' ')}
    >
      <GripVertical className="w-3.5 h-3.5" aria-hidden />
    </button>
  )
}

// ─── Generic Sortable Container ──────────────────────────────────────────────

export interface SortableListProps<T extends { id: string }> {
  items: T[]
  onReorder: (newOrderedItems: T[]) => void
  renderItem: (item: T, opts: { isDragOverlay?: boolean }) => React.ReactNode
  disabled?: boolean
  getItemId?: (item: T) => string
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  getItemId = item => item.id,
}: SortableListProps<T>) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const activeItem = activeId ? items.find(i => getItemId(i) === activeId) ?? null : null

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex(i => getItemId(i) === active.id)
      const newIndex = items.findIndex(i => getItemId(i) === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(items, oldIndex, newIndex)
      onReorder(reordered)
    },
    [items, getItemId, onReorder]
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  const sortableIds = items.map(getItemId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={sortableIds}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {items.map(item => {
          const id = getItemId(item)
          return (
            <SortableItem key={id} id={id} disabled={disabled}>
              {renderItem(item, {})}
            </SortableItem>
          )
        })}
      </SortableContext>

      <DragOverlay>
        {activeItem ? renderItem(activeItem, { isDragOverlay: true }) : null}
      </DragOverlay>
    </DndContext>
  )
}
