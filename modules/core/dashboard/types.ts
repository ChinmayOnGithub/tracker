import React from 'react'

export interface DashboardWidgetProps {
  userId: string
  todayStr: string // YYYY-MM-DD format (timezone-safe)
}

export type DashboardWidget = React.ComponentType<DashboardWidgetProps>

export interface WidgetLayoutConfig {
  id: string
  title: string
  visible: boolean
  size: 'sm' | 'md' | 'lg' | 'full'
  order: number
}
