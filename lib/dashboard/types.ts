/**
 * Canonical Dashboard & Widget Grid Types
 * Designed for the 20-column desktop grid with responsive mobile adaptation.
 */

export interface WidgetLayoutItem {
  id: string
  x: number // 0-indexed column (0 to 19)
  y: number // 0-indexed row
  w: number // column span (1 to 20)
  h: number // row span (grid row units)
}

export interface WidgetDefinition {
  id: string
  title: string
  description: string
  category: 'Habits' | 'Work' | 'Health' | 'Vault' | 'Coding' | 'General'
  defaultEnabled: boolean
  defaultW: number
  defaultH: number
  minW: number
  maxW: number
  minH: number
  maxH: number
}

export interface DashboardConfig {
  version: number // e.g. 2
  items: WidgetLayoutItem[]
  hidden: string[]
  // Legacy backward compatibility fields
  order?: string[]
}

export type LegacyDashboardConfig = {
  order?: string[]
  hidden?: string[]
  items?: WidgetLayoutItem[]
  version?: number
}
