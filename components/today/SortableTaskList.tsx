"use client"

/**
 * SortableTaskList — Tracker-owned dnd-kit wrapper for the Today task list.
 *
 * Keeps dnd-kit's API entirely behind this component boundary. Nothing outside
 * this file imports from @dnd-kit directly.
 *
 * Accessibility:
 *  - Full keyboard drag via @dnd-kit's built-in KeyboardSensor (Tab, Space/Enter
 *    to pick up, arrow keys to move, Space/Enter to drop, Escape to cancel).
 *  - GripVertical handle is the explicit drag activator — clicking the row does
 *    not accidentally trigger drag.
 *  - aria-roledescription and instructions announced via the built-in announcements.
 *  - Non-template items (Google Calendar events) receive no drag handle.
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
import { TimelineItem } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SortableTaskListProps {
  /** Full ordered task list */
  items: TimelineItem[]
  /** Called with new ordered IDs after a drag ends */
  onReorder: (orderedIds: string[]) => void
  /** Render prop for each item — children get the item + whether it is the drag overlay */
  renderItem: (item: TimelineItem, opts: { isDragOverlay?: boolean }) => React.ReactNode
  /** Optional: whether sorting is disabled (e.g. during an async save) */
  disabled?: boolean
}

// ─── Sortable item wrapper ────────────────────────────────────────────────────

interface SortableItemProps {
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
      {/* Inject the drag handle ref and listeners as a data attribute context */}
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

// ─── Drag handle widget ───────────────────────────────────────────────────────

interface DragHandleProps {
  dragHandleRef?: (el: HTMLElement | null) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleListeners?: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleAttributes?: Record<string, any>
}

/**
 * Standalone drag handle button. Import this inside TaskRow and spread
 * the props that SortableItem injects via cloneElement.
 */
export function DragHandle({
  dragHandleRef,
  dragHandleListeners,
  dragHandleAttributes,
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
        'touch-none', // required by dnd-kit for touch devices
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/50 rounded-sm',
      ].join(' ')}
    >
      <GripVertical className="w-3.5 h-3.5" aria-hidden />
    </button>
  )
}

// ─── Main SortableTaskList ────────────────────────────────────────────────────

export function SortableTaskList({
  items,
  onReorder,
  renderItem,
  disabled = false,
}: SortableTaskListProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a 5px move before drag starts — avoids accidental drags on click/tap
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const activeItem = activeId ? items.find(i => i.id === activeId) ?? null : null

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = items.findIndex(i => i.id === active.id)
      const newIndex = items.findIndex(i => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(items, oldIndex, newIndex)
      const ids = reordered
        .map(i => i.templateId)
        .filter((id): id is string => !!id)
      onReorder(ids)
    },
    [items, onReorder]
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  // Only sortable items (those with a templateId) participate in dnd
  const sortableIds = items.map(i => i.id)

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
        {items.map(item => (
          <SortableItem
            key={item.id}
            id={item.id}
            disabled={disabled || !item.templateId}
          >
            {renderItem(item, {})}
          </SortableItem>
        ))}
      </SortableContext>

      {/* Drag overlay — renders the item floating under the cursor while dragging */}
      <DragOverlay>
        {activeItem ? renderItem(activeItem, { isDragOverlay: true }) : null}
      </DragOverlay>
    </DndContext>
  )
}
