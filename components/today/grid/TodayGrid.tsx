"use client"

/**
 * TodayGrid
 * Customizable, drag-and-drop, resizable widget grid container for the Today view.
 * Handles desktop 20-column responsive reflow layout and mobile stacked fallback.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { WidgetLayoutItem, DashboardConfig } from '@/lib/dashboard/types'
import { GRID_COLUMNS } from '@/lib/dashboard/registry'
import {
  reflowLayout,
  clampItem,
} from '@/lib/dashboard/layoutEngine'
import { GridWidgetWrapper } from './GridWidgetWrapper'

interface TodayGridProps {
  config: DashboardConfig
  isEditing: boolean
  onChangeConfig: (newConfig: DashboardConfig) => void
  renderWidget: (widgetId: string, w: number, h: number) => React.ReactNode
  onHideWidget: (widgetId: string) => void
}

export const TodayGrid: React.FC<TodayGridProps> = ({
  config,
  isEditing,
  onChangeConfig,
  renderWidget,
  onHideWidget,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Active drag/resize interaction state
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [activeResizeId, setActiveResizeId] = useState<string | null>(null)
  const [resizeDirection, setResizeDirection] = useState<'se' | 'e' | 's'>('se')

  // Live optimistic items during active gesture
  const [gestureItems, setGestureItems] = useState<WidgetLayoutItem[] | null>(null)
  const liveItems = gestureItems ?? config.items

  // Drag interaction refs
  const dragStartRef = useRef<{
    startX: number
    startY: number
    itemX: number
    itemY: number
    itemW: number
    itemH: number
    colWidth: number
    rowHeight: number
  } | null>(null)

  const handleDragStart = useCallback((e: React.PointerEvent, item: WidgetLayoutItem) => {
    if (!isEditing || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const colWidth = rect.width / GRID_COLUMNS
    const rowHeight = 64 // fixed logical row height in px

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      itemX: item.x,
      itemY: item.y,
      itemW: item.w,
      itemH: item.h,
      colWidth,
      rowHeight,
    }

    setActiveDragId(item.id)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [isEditing])

  const handleResizeStart = useCallback((
    e: React.PointerEvent,
    item: WidgetLayoutItem,
    direction: 'se' | 'e' | 's'
  ) => {
    if (!isEditing || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const colWidth = rect.width / GRID_COLUMNS
    const rowHeight = 64

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      itemX: item.x,
      itemY: item.y,
      itemW: item.w,
      itemH: item.h,
      colWidth,
      rowHeight,
    }

    setActiveResizeId(item.id)
    setResizeDirection(direction)
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [isEditing])

  // Global pointer move / up for drag & resize
  const originalItemsRef = useRef<WidgetLayoutItem[] | null>(null)

  useEffect(() => {
    if (!activeDragId && !activeResizeId) {
      originalItemsRef.current = null
      return
    }

    if (!originalItemsRef.current) {
      originalItemsRef.current = config.items
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current || !originalItemsRef.current) return
      const { startX, startY, itemX, itemY, itemW, itemH, colWidth, rowHeight } = dragStartRef.current
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY

      if (activeDragId) {
        // Dragging: compute new snapped x and y
        const colsMoved = Math.round(deltaX / colWidth)
        const rowsMoved = Math.round(deltaY / rowHeight)

        // Mobile widget behavior: if user moved back to original cell without releasing, restore original layout exactly!
        if (colsMoved === 0 && rowsMoved === 0) {
          setGestureItems(originalItemsRef.current)
          return
        }

        const targetX = itemX + colsMoved
        const targetY = itemY + rowsMoved

        const clamped = clampItem({
          id: activeDragId,
          x: targetX,
          y: targetY,
          w: itemW,
          h: itemH,
        })

        // Always compute collision and reflow from original items base to prevent permanent drift while moving
        const updated = originalItemsRef.current.map(i => (i.id === activeDragId ? clamped : i))
        const reflowed = reflowLayout(updated, activeDragId)
        setGestureItems(reflowed)
      } else if (activeResizeId) {
        // Resizing: compute new snapped width and height
        const colsExpanded = Math.round(deltaX / colWidth)
        const rowsExpanded = Math.round(deltaY / rowHeight)

        if (colsExpanded === 0 && rowsExpanded === 0) {
          setGestureItems(originalItemsRef.current)
          return
        }

        let targetW = itemW
        let targetH = itemH

        if (resizeDirection === 'se' || resizeDirection === 'e') {
          targetW = itemW + colsExpanded
        }
        if (resizeDirection === 'se' || resizeDirection === 's') {
          targetH = itemH + rowsExpanded
        }

        const clamped = clampItem({
          id: activeResizeId,
          x: itemX,
          y: itemY,
          w: targetW,
          h: targetH,
        })

        const updated = originalItemsRef.current.map(i => (i.id === activeResizeId ? clamped : i))
        const reflowed = reflowLayout(updated, activeResizeId)
        setGestureItems(reflowed)
      }
    }

    const handlePointerUp = () => {
      if ((activeDragId || activeResizeId) && gestureItems) {
        // Commit final layout only if items changed
        onChangeConfig({
          ...config,
          items: gestureItems,
        })
      }
      setGestureItems(null)
      setActiveDragId(null)
      setActiveResizeId(null)
      dragStartRef.current = null
      originalItemsRef.current = null
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cancel gesture immediately, reverting to original
        setGestureItems(null)
        setActiveDragId(null)
        setActiveResizeId(null)
        dragStartRef.current = null
        originalItemsRef.current = null
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeDragId, activeResizeId, resizeDirection, gestureItems, config, onChangeConfig])

  // Filter visible items
  const visibleItems = liveItems.filter(item => !config.hidden.includes(item.id))

  // Compute maximum row reached to ensure grid expands gracefully
  const maxRow = visibleItems.reduce((max, item) => Math.max(max, item.y + item.h), 0)

  return (
    <div className="w-full relative">
      {/* Desktop 20-Column Grid Container */}
      <div
        ref={containerRef}
        className={`w-full hidden lg:grid grid-cols-20 auto-rows-[64px] gap-4 transition-all ${
          isEditing ? 'min-h-[400px] p-2 rounded-[var(--radius-xl)] bg-[var(--color-bg-base)]/40 border border-dashed border-[var(--color-border)]' : ''
        }`}
        style={{
          gridTemplateRows: `repeat(${Math.max(maxRow, 6)}, 64px)`,
        }}
      >
        {visibleItems.map(item => {
          const isDragging = item.id === activeDragId
          const isResizing = item.id === activeResizeId

          return (
            <div
              key={item.id}
              style={{
                gridColumn: `${item.x + 1} / span ${item.w}`,
                gridRow: `${item.y + 1} / span ${item.h}`,
              }}
              className="min-h-0 min-w-0"
            >
              <GridWidgetWrapper
                item={item}
                isEditing={isEditing}
                isDragging={isDragging}
                isResizing={isResizing}
                onHideWidget={onHideWidget}
                onDragStart={handleDragStart}
                onResizeStart={handleResizeStart}
                className="h-full"
              >
                {renderWidget(item.id, item.w, item.h)}
              </GridWidgetWrapper>
            </div>
          )
        })}
      </div>

      {/* Responsive Mobile / Tablet Stacked Presentation (< 1024px) */}
      <div className="flex flex-col gap-6 lg:hidden w-full">
        {visibleItems.map(item => (
          <div key={item.id} className="w-full">
            <GridWidgetWrapper
              item={item}
              isEditing={false} // Clean touch experience on mobile
              className="w-full"
            >
              {renderWidget(item.id, item.w, item.h)}
            </GridWidgetWrapper>
          </div>
        ))}
      </div>
    </div>
  )
}
