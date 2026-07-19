'use client'

import React, { createContext, useContext, useId } from 'react'

// ─── Context ──────────────────────────────────────────────────────────────────

interface TabsContextValue {
  activeTab: string
  setActiveTab: (id: string) => void
  variant: 'underline' | 'pill'
  baseId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('<TabsList> and <TabsContent> must be inside <Tabs>')
  return ctx
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface TabsProps {
  defaultTab: string
  activeTab?: string
  onTabChange?: (id: string) => void
  variant?: 'underline' | 'pill'
  children: React.ReactNode
  className?: string
}

export const Tabs: React.FC<TabsProps> = ({
  defaultTab,
  activeTab: controlledTab,
  onTabChange,
  variant = 'underline',
  children,
  className = '',
}) => {
  const [internalTab, setInternalTab] = React.useState(defaultTab)
  const baseId = useId()

  const activeTab = controlledTab ?? internalTab
  const setActiveTab = (id: string) => {
    setInternalTab(id)
    onTabChange?.(id)
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, variant, baseId }}>
      <div className={`flex flex-col ${className}`}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

// ─── Tab List ─────────────────────────────────────────────────────────────────

interface TabsListProps {
  children: React.ReactNode
  className?: string
}

export const TabsList: React.FC<TabsListProps> = ({ children, className = '' }) => {
  const { variant } = useTabsContext()

  const listStyle =
    variant === 'pill'
      ? 'flex gap-1 p-1 bg-[var(--color-accent)] rounded-[var(--radius-lg)]'
      : 'flex gap-0 border-b border-[var(--color-border)]'

  return (
    <div role="tablist" className={`${listStyle} ${className}`}>
      {children}
    </div>
  )
}

// ─── Tab Trigger ──────────────────────────────────────────────────────────────

interface TabProps {
  id: string
  children: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  className?: string
}

export const Tab: React.FC<TabProps> = ({ id, children, icon, disabled, className = '' }) => {
  const { activeTab, setActiveTab, variant, baseId } = useTabsContext()
  const isActive = activeTab === id

  const underlineStyle = isActive
    ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)] -mb-px'
    : 'border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:border-[var(--color-border)]'

  const pillStyle = isActive
    ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-main)] shadow-[var(--card-shadow)]'
    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)]'

  return (
    <button
      role="tab"
      id={`${baseId}-tab-${id}`}
      aria-controls={`${baseId}-panel-${id}`}
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(id)}
      className={`
        inline-flex items-center gap-1.5 text-sm font-medium
        transition-all duration-[var(--motion-duration-fast)]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variant === 'pill'
          ? `px-3 py-1.5 rounded-[var(--radius-md)] ${pillStyle}`
          : `px-3 py-2 ${underlineStyle}`
        }
        ${className}
      `}
    >
      {icon && <span className="flex-shrink-0 w-4 h-4">{icon}</span>}
      {children}
    </button>
  )
}

// ─── Tab Panel ────────────────────────────────────────────────────────────────

interface TabsContentProps {
  id: string
  children: React.ReactNode
  className?: string
}

export const TabsContent: React.FC<TabsContentProps> = ({ id, children, className = '' }) => {
  const { activeTab, baseId } = useTabsContext()
  if (activeTab !== id) return null

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${id}`}
      aria-labelledby={`${baseId}-tab-${id}`}
      className={`focus:outline-none ${className}`}
    >
      {children}
    </div>
  )
}
