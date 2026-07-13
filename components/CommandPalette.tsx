"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Search, Calendar, FileText, CheckSquare, Scale, Briefcase } from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  shortcut?: string
  icon: React.ReactNode
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNewActivity: () => void
  onNavigate: (tabId: string) => void
  onShowPlaceholder: (title: string, message: string) => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNewActivity,
  onNavigate,
  onShowPlaceholder
}) => {
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands: CommandItem[] = [
    {
      id: 'new-activity',
      label: 'New Activity',
      shortcut: 'A',
      icon: <PlusIcon />,
      action: () => {
        onNewActivity()
        onClose()
      }
    },
    {
      id: 'go-calendar',
      label: 'Go to Calendar',
      shortcut: 'C',
      icon: <Calendar className="w-4 h-4 text-blue-500" />,
      action: () => {
        onNavigate('calendar')
        onClose()
      }
    },
    {
      id: 'go-journal',
      label: 'Go to Journal',
      shortcut: 'J',
      icon: <FileText className="w-4 h-4 text-teal-500" />,
      action: () => {
        onNavigate('journal')
        onClose()
      }
    },
    {
      id: 'log-weight',
      label: 'Log Weight',
      shortcut: 'W',
      icon: <Scale className="w-4 h-4 text-indigo-500" />,
      action: () => {
        onNavigate('weight')
        onClose()
      }
    },
    {
      id: 'request-leave',
      label: 'Request Leave',
      shortcut: 'L',
      icon: <Briefcase className="w-4 h-4 text-purple-500" />,
      action: () => {
        onNavigate('leave')
        onClose()
      }
    },
    {
      id: 'search-activities',
      label: 'Search Activities',
      shortcut: 'S',
      icon: <CheckSquare className="w-4 h-4 text-amber-500" />,
      action: () => {
        onNavigate('activities')
        onClose()
      }
    },
    {
      id: 'search-docs',
      label: 'Search Documents',
      shortcut: 'D',
      icon: <FileText className="w-4 h-4 text-slate-500" />,
      action: () => {
        onShowPlaceholder('Search Documents', 'Secure Vault document search remains Decoupled. You can search documents under the Secure Vault tab.')
        onClose()
      }
    }
  ]

  // Filter based on search query
  const filtered = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(search.toLowerCase())
  )

  // Listen to keyboard trigger (Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) onClose()
        else inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus input on mount/open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setSearch('')
        setActiveIndex(0)
        inputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  // Keyboard navigation inside list
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => (prev - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) {
        filtered[activeIndex].action()
      }
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const activeEl = listRef.current?.children[activeIndex] as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      {/* Backdrop Close Click */}
      <div className="fixed inset-0 cursor-default" onClick={onClose} />
      
      {/* Main Command Input Box */}
      <div 
        className="w-full max-w-lg bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden flex flex-col relative max-h-[360px] animate-in fade-in zoom-in-[0.98] slide-in-from-top-4 duration-300 ease-out"
        onKeyDown={handleListKeyDown}
      >
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)] dark:border-zinc-855 h-12 shrink-0">
          <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveIndex(0)
            }}
            className="flex-1 bg-transparent text-xs font-bold text-[var(--color-text-main)] placeholder-slate-400 focus:outline-hidden"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-bold text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-center py-6 text-xs text-[var(--color-text-muted)] font-medium italic">
              No matching commands found.
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isActive = idx === activeIndex
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all text-left cursor-pointer ${
                    isActive 
                      ? 'bg-[var(--color-primary)] text-white' 
                      : 'text-[var(--color-text-main)] hover:bg-slate-100/60 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={isActive ? 'text-white' : ''}>{cmd.icon}</span>
                    <span className="truncate">{cmd.label}</span>
                  </div>
                  {cmd.shortcut && (
                    <kbd className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                      isActive 
                        ? 'bg-white/20 text-white border-transparent' 
                        : 'text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800'
                    }`}>
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

const PlusIcon = () => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className="w-4 h-4 text-emerald-500"
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
)

