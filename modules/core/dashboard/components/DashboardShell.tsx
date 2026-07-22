import React, { useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  CheckSquare,
  BookOpen,
  CalendarX,
  FileText,
  Settings,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  Scale,
  Link2
} from 'lucide-react'
import { Button } from '@/design-system'

export interface NavigationItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface DashboardShellProps {
  children: React.ReactNode
  activeTab: string
  onTabChange: (id: string) => void
  user: { username: string } | null
  onLogout: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  children,
  activeTab,
  onTabChange,
  user,
  onLogout,
  theme,
  onToggleTheme
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)

  // Module visibility config (Safe hydration check on mount)
  const [visibleModules, setVisibleModules] = React.useState<Record<string, boolean>>(() => {
    const defaults = {
      today: true,
      calendar: true,
      activities: true,
      journal: true,
      leave: true,
      weight: true,
      links: true,
      documents: true,
      settings: true,
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('personal_modules_visibility')
      if (saved) {
        try {
          return { ...defaults, ...JSON.parse(saved) }
        } catch (e) {
          console.error(e)
        }
      }
    }
    return defaults
  })

  React.useEffect(() => {
    const handleSettingsUpdate = () => {
      const updated = localStorage.getItem('personal_modules_visibility')
      if (updated) {
        try {
          setVisibleModules(prev => ({ ...prev, ...JSON.parse(updated) }))
        } catch (e) {
          console.error(e)
        }
      }
    }
    window.addEventListener('personal_settings_changed', handleSettingsUpdate)
    return () => window.removeEventListener('personal_settings_changed', handleSettingsUpdate)
  }, [])

  const allNavItems: NavigationItem[] = [
    { id: 'today', label: 'Today', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'activities', label: 'Activities', icon: CheckSquare },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'leave', label: 'Time Off', icon: CalendarX },
    { id: 'weight', label: 'Weight', icon: Scale },
    { id: 'links', label: 'Link Library', icon: Link2 },
    { id: 'documents', label: 'Secure Vault', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  const navItems = allNavItems.filter(item => visibleModules[item.id] !== false)

  const bottomNavItems = [
    { id: 'today', label: 'Today', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'weight', label: 'Weight', icon: Scale },
  ].filter(item => visibleModules[item.id] !== false)

  const moreNavItems = [
    { id: 'activities', label: 'Activities', icon: CheckSquare },
    { id: 'leave', label: 'Time Off', icon: CalendarX },
    { id: 'links', label: 'Link Library', icon: Link2 },
    { id: 'documents', label: 'Secure Vault', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ].filter(item => visibleModules[item.id] !== false)

  const currentItem = allNavItems.find(item => item.id === activeTab)

  return (
    <div className="flex h-screen bg-[var(--color-bg-base)] overflow-hidden font-sans relative">
      {/* Mobile Sidebar Back-drop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Navigation Sidebar (Desktop & Mobile drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] transform transition-transform duration-200 lg:translate-x-0 lg:static lg:inset-auto ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Sidebar Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--color-primary)] flex items-center justify-center text-white font-black text-sm">
              T
            </div>
            <span className="text-sm font-extrabold text-[var(--color-text-main)] tracking-tight">
              Tracker
            </span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] lg:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const IconComponent = item.icon
            const isActive = activeTab === item.id

            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id)
                  setIsSidebarOpen(false)
                }}
                className={`w-full flex items-center gap-3 px-3 py-1.75 text-xs font-medium rounded-[var(--radius-md)] transition-all duration-[var(--motion-duration-fast)] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)] ${isActive
                    ? 'bg-[var(--color-accent)] text-[var(--color-text-main)] border border-[var(--color-border)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]/50 hover:text-[var(--color-text-main)] border border-transparent'
                  }`}
              >
                <IconComponent className={`w-3.75 h-3.75 transition-colors ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* User Info & Footer Settings */}
        <div className="p-4 border-t border-[var(--color-border)] flex flex-col gap-2">
          {user && (
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] truncate max-w-[120px]">
                {user.username}
              </span>
              <button
                onClick={onToggleTheme}
                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-[var(--color-text-main)] transition-colors duration-150"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-[var(--radius-md)] text-rose-500 hover:bg-rose-500/10 transition-colors duration-150 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Navigation Header */}
        <header className="h-14 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-4 lg:px-6 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-sm font-bold text-[var(--color-text-main)] tracking-tight">
              {currentItem?.label || 'Dashboard'}
            </h1>
          </div>
          {/* Header Action Date Info */}
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[var(--color-text-muted)]">
            <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        </header>

        {/* Dashboard Workspace */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-6">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] h-16 flex items-center justify-around px-2 z-40 lg:hidden pb-safe shadow-lg">
        {bottomNavItems.map(item => {
          const IconComponent = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id)
                setIsMoreOpen(false)
              }}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all cursor-pointer ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
                }`}
            >
              <IconComponent className="w-4.5 h-4.5" />
              <span className="text-[9px] font-bold tracking-tight">{item.label}</span>
            </button>
          )
        })}
        <button
          onClick={() => setIsMoreOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-all cursor-pointer ${isMoreOpen || moreNavItems.some(n => n.id === activeTab) ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
            }`}
        >
          <Menu className="w-4.5 h-4.5" />
          <span className="text-[9px] font-bold tracking-tight">More</span>
        </button>
      </div>

      {/* Mobile "More" Bottom Sheet Menu */}
      {isMoreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMoreOpen(false)}
          />
          {/* Bottom Sheet Panel */}
          <div className="relative bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] rounded-t-3xl p-5 pb-8 space-y-4 shadow-2xl z-10 animate-fade-in-up max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]/50">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">More Modules</h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsMoreOpen(false)}
                icon={<X className="w-4 h-4" />}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {moreNavItems.map(item => {
                const IconComponent = item.icon
                const isActive = activeTab === item.id
                return (
                  <Button
                    key={item.id}
                    variant={isActive ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => {
                      onTabChange(item.id)
                      setIsMoreOpen(false)
                    }}
                    icon={<IconComponent className="w-4.5 h-4.5" />}
                    className="w-full justify-start"
                  >
                    {item.label}
                  </Button>
                )
              })}
            </div>

            <div className="pt-4 border-t border-[var(--color-border)] flex flex-col gap-3">
              {user && (
                <div className="flex items-center justify-between px-2 text-xs font-semibold text-[var(--color-text-muted)]">
                  <span>Logged in as: {user.username}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onToggleTheme}
                    icon={theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-500" />}
                  />
                </div>
              )}
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setIsMoreOpen(false)
                  onLogout()
                }}
                icon={<LogOut className="w-4 h-4" />}
                className="w-full"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

