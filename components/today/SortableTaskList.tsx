"use client"

/**
 * SortableTaskList — Tracker-owned dnd-kit wrapper for the Today task list.
 * Delegates core mechanics to the shared SortableList abstraction.
 */

import React from 'react'
import { TimelineItem } from '@/types'
import { SortableList, DragHandle, SortableItem } from '@/components/shared/SortableList'

export { DragHandle, SortableItem }

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

export function SortableTaskList({
  items,
  onReorder,
  renderItem,
  disabled = false,
}: SortableTaskListProps) {
  return (
    <SortableList<TimelineItem>
      items={items}
      onReorder={(reordered) => {
        const ids = reordered
          .map(i => i.templateId)
          .filter((id): id is string => !!id)
        onReorder(ids)
      }}
      renderItem={renderItem}
      disabled={disabled}
      getItemId={item => item.id}
    />
  )
}
