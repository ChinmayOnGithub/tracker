import { WidgetLayoutItem, DashboardConfig, LegacyDashboardConfig } from './types'
import { WIDGET_REGISTRY, GRID_COLUMNS, CURRENT_DASHBOARD_VERSION, getWidgetDefinition } from './registry'

/**
 * Checks if two rectangular grid items overlap (AABB intersection).
 */
export function doesOverlap(a: WidgetLayoutItem, b: WidgetLayoutItem): boolean {
  if (a.id === b.id) return false
  const aRight = a.x + a.w
  const aBottom = a.y + a.h
  const bRight = b.x + b.w
  const bBottom = b.y + b.h

  return a.x < bRight && aRight > b.x && a.y < bBottom && aBottom > b.y
}

/**
 * Clamps a widget's position and size to stay within grid boundaries and registry constraints.
 */
export function clampItem(item: WidgetLayoutItem, columns = GRID_COLUMNS): WidgetLayoutItem {
  const def = getWidgetDefinition(item.id)

  const minW = def ? def.minW : 1
  const maxW = def ? Math.min(def.maxW, columns) : columns
  const minH = def ? def.minH : 1
  const maxH = def ? def.maxH : 50

  // 1. Clamp dimensions
  const w = Math.max(minW, Math.min(maxW, item.w))
  const h = Math.max(minH, Math.min(maxH, item.h))

  // 2. Clamp x so item stays inside [0, columns - w]
  const maxX = Math.max(0, columns - w)
  const x = Math.max(0, Math.min(maxX, item.x))

  // 3. Clamp y >= 0
  const y = Math.max(0, item.y)

  return {
    id: item.id,
    x,
    y,
    w,
    h,
  }
}

/**
 * Finds the next available non-overlapping position for an item of given dimensions.
 */
export function findNextAvailablePosition(
  placedItems: WidgetLayoutItem[],
  w: number,
  h: number,
  columns = GRID_COLUMNS
): { x: number; y: number } {
  let y = 0
  while (true) {
    for (let x = 0; x <= columns - w; x++) {
      const candidate: WidgetLayoutItem = { id: '__candidate__', x, y, w, h }
      const hasCollision = placedItems.some(item => doesOverlap(candidate, item))
      if (!hasCollision) {
        return { x, y }
      }
    }
    y++
  }
}

/**
 * Deterministically reflows widgets downwards when a widget is moved or resized.
 * Pushes colliding items below the active item recursively/iteratively without permanent overlaps.
 */
export function reflowLayout(
  items: WidgetLayoutItem[],
  activeId: string,
  columns = GRID_COLUMNS
): WidgetLayoutItem[] {
  // Deep clone and clamp
  const result = items.map(item => clampItem(item, columns))
  const activeItem = result.find(i => i.id === activeId)
  if (!activeItem) return compactLayout(result, columns)

  // Items to resolve collisions with
  let hasOverlap = true
  let iterations = 0
  const MAX_ITERATIONS = 200

  while (hasOverlap && iterations < MAX_ITERATIONS) {
    hasOverlap = false
    iterations++

    // Sort items by y asc, then x asc
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result.length; j++) {
        if (i === j) continue
        const itemA = result[i]
        const itemB = result[j]

        if (doesOverlap(itemA, itemB)) {
          hasOverlap = true
          // If one is the active item, move the OTHER item down
          if (itemA.id === activeId) {
            itemB.y = itemA.y + itemA.h
          } else if (itemB.id === activeId) {
            itemA.y = itemB.y + itemB.h
          } else {
            // Neither is active, move the one with lower original y down
            if (itemA.y <= itemB.y) {
              itemB.y = itemA.y + itemA.h
            } else {
              itemA.y = itemB.y + itemB.h
            }
          }
        }
      }
    }
  }

  return compactLayout(result, columns, activeId)
}

/**
 * Gravity compaction: pulls items upward towards row 0 if there is free space above them,
 * preserving relative column positioning without causing overlaps.
 */
export function compactLayout(
  items: WidgetLayoutItem[],
  columns = GRID_COLUMNS,
  lockedId?: string
): WidgetLayoutItem[] {
  // Sort items by y ascending, then x ascending
  const sorted = [...items].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })

  const compacted: WidgetLayoutItem[] = []

  for (const item of sorted) {
    const current = clampItem(item, columns)

    if (current.id === lockedId) {
      compacted.push(current)
      continue
    }

    // Move current.y upwards as much as possible
    let bestY = current.y
    for (let candidateY = current.y - 1; candidateY >= 0; candidateY--) {
      const testItem = { ...current, y: candidateY }
      const collision = compacted.some(other => doesOverlap(testItem, other))
      if (!collision) {
        bestY = candidateY
      } else {
        break
      }
    }

    compacted.push({ ...current, y: bestY })
  }

  // Restore original ordering
  return items.map(original => compacted.find(c => c.id === original.id) || original)
}

/**
 * Generates the canonical default dashboard layout with Tasks on the left (w=13)
 * and the right column widgets stacked on the right (x=13, w=7).
 */
export function generateDefaultDashboardLayout(): DashboardConfig {
  const hidden = WIDGET_REGISTRY.filter(w => !w.defaultEnabled).map(w => w.id)
  const visibleWidgets = WIDGET_REGISTRY.filter(w => w.defaultEnabled)

  const items: WidgetLayoutItem[] = []

  // Left column: Tasks
  const tasksDef = getWidgetDefinition('tasks')!
  items.push({
    id: 'tasks',
    x: 0,
    y: 0,
    w: tasksDef.defaultW,
    h: tasksDef.defaultH,
  })

  // Right column: Work hours, Journal, Leave, Weight, Recent Docs
  let rightY = 0
  const rightColumnWidgets = visibleWidgets.filter(w => w.id !== 'tasks')
  for (const w of rightColumnWidgets) {
    items.push({
      id: w.id,
      x: 13,
      y: rightY,
      w: w.defaultW,
      h: w.defaultH,
    })
    rightY += w.defaultH
  }

  return {
    version: CURRENT_DASHBOARD_VERSION,
    items,
    hidden,
    order: WIDGET_REGISTRY.map(w => w.id),
  }
}

/**
 * Migrates any legacy or partially configured dashboard layout into a valid,
 * non-overlapping, fully normalized DashboardConfig.
 */
export function migrateAndNormalizeDashboardConfig(
  rawConfig: LegacyDashboardConfig | null | undefined
): DashboardConfig {
  if (!rawConfig) {
    return generateDefaultDashboardLayout()
  }

  // If already version >= 2 and has valid items, validate and normalize
  if (rawConfig.version && rawConfig.version >= 2 && Array.isArray(rawConfig.items) && rawConfig.items.length > 0) {
    const hiddenSet = new Set(rawConfig.hidden || [])
    // Ensure all registry widgets are accounted for
    const existingIds = new Set(rawConfig.items.map(i => i.id))
    const validItems = rawConfig.items
      .filter(i => getWidgetDefinition(i.id) !== undefined)
      .map(i => clampItem(i, GRID_COLUMNS))

    // Check for any newly added registry widgets not in items
    for (const def of WIDGET_REGISTRY) {
      if (!existingIds.has(def.id)) {
        if (!def.defaultEnabled) {
          hiddenSet.add(def.id)
        }
        const pos = findNextAvailablePosition(validItems, def.defaultW, def.defaultH, GRID_COLUMNS)
        validItems.push({
          id: def.id,
          x: pos.x,
          y: pos.y,
          w: def.defaultW,
          h: def.defaultH,
        })
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>()
    const dedupedItems: WidgetLayoutItem[] = []
    for (const item of validItems) {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        dedupedItems.push(item)
      }
    }

    const compacted = compactLayout(dedupedItems, GRID_COLUMNS)

    return {
      version: CURRENT_DASHBOARD_VERSION,
      items: compacted,
      hidden: Array.from(hiddenSet),
      order: compacted.map(i => i.id),
    }
  }

  // Migration from legacy v1 ({ order: string[], hidden: string[] }):
  const legacyOrder = Array.isArray(rawConfig.order) ? rawConfig.order : []
  const legacyHidden = new Set(Array.isArray(rawConfig.hidden) ? rawConfig.hidden : [])

  // Build items starting with default Tasks layout
  const items: WidgetLayoutItem[] = []
  const tasksDef = getWidgetDefinition('tasks')!
  items.push({
    id: 'tasks',
    x: 0,
    y: 0,
    w: tasksDef.defaultW,
    h: tasksDef.defaultH,
  })

  // Next, stack the legacy ordered widgets on the right
  let rightY = 0
  const registryIds = WIDGET_REGISTRY.map(w => w.id)
  const orderedIds = [
    ...legacyOrder.filter(id => registryIds.includes(id) && id !== 'tasks'),
    ...registryIds.filter(id => !legacyOrder.includes(id) && id !== 'tasks'),
  ]

  for (const id of orderedIds) {
    const def = getWidgetDefinition(id)
    if (!def) continue

    if (!legacyHidden.has(id) && !rawConfig.order?.includes(id) && !def.defaultEnabled) {
      legacyHidden.add(id)
    }

    items.push({
      id: def.id,
      x: 13,
      y: rightY,
      w: def.defaultW,
      h: def.defaultH,
    })
    rightY += def.defaultH
  }

  return {
    version: CURRENT_DASHBOARD_VERSION,
    items,
    hidden: Array.from(legacyHidden),
    order: items.map(i => i.id),
  }
}
