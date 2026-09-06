import { describe, it, expect } from 'bun:test'
import {
  doesOverlap,
  clampItem,
  findNextAvailablePosition,
  reflowLayout,
  compactLayout,
  generateDefaultDashboardLayout,
  migrateAndNormalizeDashboardConfig,
} from '@/lib/dashboard/layoutEngine'
import { GRID_COLUMNS } from '@/lib/dashboard/registry'
import { WidgetLayoutItem } from '@/lib/dashboard/types'

describe('Dashboard Layout Engine Tests', () => {
  it('doesOverlap: accurately detects AABB overlaps', () => {
    const item1: WidgetLayoutItem = { id: 'w1', x: 0, y: 0, w: 10, h: 5 }
    const item2: WidgetLayoutItem = { id: 'w2', x: 5, y: 2, w: 10, h: 5 }
    const item3: WidgetLayoutItem = { id: 'w3', x: 10, y: 0, w: 10, h: 5 }

    // Intersecting
    expect(doesOverlap(item1, item2)).toBe(true)
    // Touching edges should not count as overlap
    expect(doesOverlap(item1, item3)).toBe(false)
    // Self should not overlap with self
    expect(doesOverlap(item1, item1)).toBe(false)
  })

  it('clampItem: clamps size within min/max bounds and prevents out-of-grid x', () => {
    const tasks = clampItem({ id: 'tasks', x: 15, y: -5, w: 25, h: 1 })
    expect(tasks.x).toBeLessThanOrEqual(GRID_COLUMNS - tasks.w)
    expect(tasks.y).toBe(0)
    expect(tasks.w).toBeLessThanOrEqual(20)
    expect(tasks.h).toBeGreaterThanOrEqual(4) // minH is 4
  })

  it('findNextAvailablePosition: finds non-overlapping slot', () => {
    const placed: WidgetLayoutItem[] = [
      { id: 'item1', x: 0, y: 0, w: 13, h: 10 },
      { id: 'item2', x: 13, y: 0, w: 7, h: 5 },
    ]

    const pos = findNextAvailablePosition(placed, 7, 5, 20)
    expect(pos.x).toBe(13)
    expect(pos.y).toBe(5)
  })

  it('reflowLayout: shifts colliding items down without permanent overlap', () => {
    const items: WidgetLayoutItem[] = [
      { id: 'tasks', x: 0, y: 0, w: 13, h: 8 },
      { id: 'workHours', x: 13, y: 0, w: 7, h: 5 },
      { id: 'journal', x: 13, y: 5, w: 7, h: 3 },
    ]

    // Move journal directly on top of workHours
    const moved = [
      items[0],
      items[1],
      { id: 'journal', x: 13, y: 0, w: 7, h: 3 },
    ]

    const reflowed = reflowLayout(moved, 'journal')
    // Verify no overlaps exist in reflowed layout
    for (let i = 0; i < reflowed.length; i++) {
      for (let j = i + 1; j < reflowed.length; j++) {
        expect(doesOverlap(reflowed[i], reflowed[j])).toBe(false)
      }
    }
  })

  it('compactLayout: eliminates vertical gaps', () => {
    const items: WidgetLayoutItem[] = [
      { id: 'workHours', x: 13, y: 10, w: 7, h: 5 },
    ]

    const compacted = compactLayout(items)
    expect(compacted[0].y).toBe(0)
  })

  it('generateDefaultDashboardLayout: produces valid 20-column default layout', () => {
    const config = generateDefaultDashboardLayout()
    expect(config.version).toBe(2)
    expect(config.items.some(i => i.id === 'tasks')).toBe(true)

    // Verify all items are within grid columns
    for (const item of config.items) {
      expect(item.x + item.w).toBeLessThanOrEqual(20)
    }

    // Verify no initial overlaps
    for (let i = 0; i < config.items.length; i++) {
      for (let j = i + 1; j < config.items.length; j++) {
        expect(doesOverlap(config.items[i], config.items[j])).toBe(false)
      }
    }
  })

  it('migrateAndNormalizeDashboardConfig: migrates legacy v1 order/hidden cleanly', () => {
    const legacy = {
      order: ['journal', 'leaveBalance', 'weight'],
      hidden: ['weight'],
    }

    const migrated = migrateAndNormalizeDashboardConfig(legacy)
    expect(migrated.version).toBe(2)
    expect(migrated.items.some(i => i.id === 'tasks')).toBe(true)
    expect(migrated.hidden).toContain('weight')
    expect(migrated.hidden).not.toContain('journal')

    // Verify no overlaps
    for (let i = 0; i < migrated.items.length; i++) {
      for (let j = i + 1; j < migrated.items.length; j++) {
        expect(doesOverlap(migrated.items[i], migrated.items[j])).toBe(false)
      }
    }
  })
})
