import React from 'react'
import { WidgetLayoutConfig } from '../types'

interface DashboardGridProps {
  configs: WidgetLayoutConfig[]
  renderWidget: (id: string) => React.ReactNode
}

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  configs,
  renderWidget
}) => {
  // Sort configs by order index
  const activeWidgets = configs
    .filter(w => w.visible)
    .sort((a, b) => a.order - b.order)

  // Map widget sizes to grid layout column span classes
  const sizeClasses = {
    sm: 'col-span-12 md:col-span-4 lg:col-span-3',
    md: 'col-span-12 md:col-span-6 lg:col-span-4',
    lg: 'col-span-12 md:col-span-8 lg:col-span-6',
    full: 'col-span-12'
  }

  return (
    <div className="grid grid-cols-12 gap-[var(--spacing-4)] w-full">
      {activeWidgets.map(widget => (
        <div
          key={widget.id}
          className={`${sizeClasses[widget.size]} flex flex-col`}
        >
          {renderWidget(widget.id)}
        </div>
      ))}
    </div>
  )
}
