"use client"

/**
 * Tracker Command Palette
 *
 * Powered by cmdk underneath — all cmdk API is contained here.
 * External consumers use the same CommandPaletteProps interface as before.
 *
 * Keyboard shortcut: Cmd/Ctrl + K
 * Mobile: open via the button rendered in DashboardLayout's mobile header.
 *
 * Rule: do NOT add business logic here. Every command calls an existing
 * action prop passed in from DashboardLayout.
 */

import React, { useEffect } from 'react'
import { Command } from 'cmdk'
import {
  Calendar, FileText, CheckSquare, Scale, Briefcase,
  Plus, Settings, LayoutDashboard, BookOpen, Link,
  LogIn, LogOut, Timer,
} from 'lucide-react'

// ─── Public interface (unchanged — DashboardLayout is unaffected) ─────────────

export interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNewActivity: () => void
  onNavigate: (tabId: string) => void
  onShowPlaceholder: (title: string, message: string) => void
}

// ─── Command definitions ──────────────────────────────────────────────────────

interface TrackerCommand {
  id: string
  label: string
  group: string
  icon: React.ReactNode
  keywords?: string
  action: (props: CommandPaletteProps) => void
}

const COMMANDS: TrackerCommand[] = [
  // Navigation
  {
    id: 'go-today',
    label: 'Go to Today',
    group: 'Navigation',
    icon: <LayoutDashboard className="w-4 h-4 text-[var(--color-primary)]" />,
    keywords: 'home dashboard today',
    action: ({ onNavigate, onClose }) => { onNavigate('today'); onClose() },
  },
  {
    id: 'go-calendar',
    label: 'Go to Calendar',
    group: 'Navigation',
    icon: <Calendar className="w-4 h-4 text-blue-500" />,
    keywords: 'calendar schedule events',
    action: ({ onNavigate, onClose }) => { onNavigate('calendar'); onClose() },
  },
  {
    id: 'go-activities',
    label: 'Go to Activities',
    group: 'Navigation',
    icon: <CheckSquare className="w-4 h-4 text-amber-500" />,
    keywords: 'activities tasks habits',
    action: ({ onNavigate, onClose }) => { onNavigate('activities'); onClose() },
  },
  {
    id: 'go-journal',
    label: 'Go to Journal',
    group: 'Navigation',
    icon: <BookOpen className="w-4 h-4 text-teal-500" />,
    keywords: 'journal diary daily',
    action: ({ onNavigate, onClose }) => { onNavigate('journal'); onClose() },
  },
  {
    id: 'go-notes',
    label: 'Go to Notes',
    group: 'Navigation',
    icon: <FileText className="w-4 h-4 text-emerald-500" />,
    keywords: 'notes scratchpad thought quick memos',
    action: ({ onNavigate, onClose }) => { onNavigate('notes'); onClose() },
  },
  {
    id: 'go-work',
    label: 'Go to Work Tracker',
    group: 'Navigation',
    icon: <Timer className="w-4 h-4 text-green-500" />,
    keywords: 'work hours tracker sessions',
    action: ({ onNavigate, onClose }) => { onNavigate('work'); onClose() },
  },
  {
    id: 'go-leave',
    label: 'Go to Time Off',
    group: 'Navigation',
    icon: <Briefcase className="w-4 h-4 text-purple-500" />,
    keywords: 'leave vacation time off pto sick',
    action: ({ onNavigate, onClose }) => { onNavigate('leave'); onClose() },
  },
  {
    id: 'go-weight',
    label: 'Go to Weight',
    group: 'Navigation',
    icon: <Scale className="w-4 h-4 text-indigo-500" />,
    keywords: 'weight health bmi',
    action: ({ onNavigate, onClose }) => { onNavigate('weight'); onClose() },
  },
  {
    id: 'go-links',
    label: 'Go to Links',
    group: 'Navigation',
    icon: <Link className="w-4 h-4 text-cyan-500" />,
    keywords: 'links bookmarks library',
    action: ({ onNavigate, onClose }) => { onNavigate('links'); onClose() },
  },
  {
    id: 'go-vault',
    label: 'Go to Vault',
    group: 'Navigation',
    icon: <FileText className="w-4 h-4 text-rose-500" />,
    keywords: 'vault documents secure files',
    action: ({ onNavigate, onClose }) => { onNavigate('documents'); onClose() },
  },
  {
    id: 'go-settings',
    label: 'Open Settings',
    group: 'Navigation',
    icon: <Settings className="w-4 h-4 text-[var(--color-text-muted)]" />,
    keywords: 'settings preferences config profile',
    action: ({ onNavigate, onClose }) => { onNavigate('settings'); onClose() },
  },
  // Actions
  {
    id: 'new-activity',
    label: 'Create Activity',
    group: 'Actions',
    icon: <Plus className="w-4 h-4 text-emerald-500" />,
    keywords: 'new create activity task habit template',
    action: ({ onNewActivity, onClose }) => { onNewActivity(); onClose() },
  },
  {
    id: 'new-journal',
    label: 'Open Journal for Today',
    group: 'Actions',
    icon: <BookOpen className="w-4 h-4 text-teal-500" />,
    keywords: 'write journal entry today new',
    action: ({ onNavigate, onClose }) => { onNavigate('journal'); onClose() },
  },
  {
    id: 'log-weight',
    label: 'Log Weight',
    group: 'Actions',
    icon: <Scale className="w-4 h-4 text-indigo-500" />,
    keywords: 'log weight track health',
    action: ({ onNavigate, onClose }) => { onNavigate('weight'); onClose() },
  },
  {
    id: 'request-leave',
    label: 'Request Time Off',
    group: 'Actions',
    icon: <LogOut className="w-4 h-4 text-purple-500" />,
    keywords: 'request leave time off vacation sick pto',
    action: ({ onNavigate, onClose }) => { onNavigate('leave'); onClose() },
  },
  {
    id: 'start-work',
    label: 'Log Work Presence',
    group: 'Actions',
    icon: <LogIn className="w-4 h-4 text-green-500" />,
    keywords: 'start work log hours presence office wfh',
    action: ({ onNavigate, onClose }) => { onNavigate('today'); onClose() },
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export const CommandPalette: React.FC<CommandPaletteProps> = (props) => {
  const { isOpen, onClose } = props

  // Cmd/Ctrl + K toggle — handled here as well as in DashboardLayout for resilience
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Group commands
  const groups = Array.from(new Set(COMMANDS.map(c => c.group)))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md"
      aria-label="Command palette overlay"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 cursor-default" onClick={onClose} aria-hidden />

      {/* cmdk dialog */}
      <Command
        label="Command palette"
        className={[
          'relative w-full max-w-lg overflow-hidden',
          'bg-[var(--color-bg-surface)] border border-[var(--color-border)]',
          'rounded-xl shadow-2xl flex flex-col',
          'max-h-[420px]',
          'animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-200',
        ].join(' ')}
        // Dismiss on Escape
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)] h-12 shrink-0">
          <svg
            className="w-4 h-4 text-[var(--color-text-muted)] shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <Command.Input
            autoFocus
            placeholder="Type a command or search…"
            className={[
              'flex-1 bg-transparent text-xs font-bold',
              'text-[var(--color-text-main)]',
              'placeholder:text-[var(--color-text-muted)]',
              'focus:outline-none',
            ].join(' ')}
          />
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-bold font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <Command.List className="flex-1 overflow-y-auto py-2 px-1.5 space-y-3">
          <Command.Empty className="py-8 text-center text-xs text-[var(--color-text-muted)] font-medium italic">
            No matching commands found.
          </Command.Empty>

          {groups.map(group => {
            const groupCmds = COMMANDS.filter(c => c.group === group)
            return (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-[var(--color-text-muted)]"
              >
                {groupCmds.map(cmd => (
                  <Command.Item
                    key={cmd.id}
                    value={`${cmd.label} ${cmd.keywords ?? ''}`}
                    onSelect={() => cmd.action(props)}
                    className={[
                      'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)]',
                      'text-xs font-semibold text-[var(--color-text-main)]',
                      'cursor-pointer select-none',
                      'transition-colors duration-[var(--motion-duration-fast)]',
                      'aria-selected:bg-[var(--color-primary)] aria-selected:text-white',
                      '[&_svg]:aria-selected:text-white',
                      'hover:bg-[var(--color-accent)]',
                    ].join(' ')}
                  >
                    <span className="shrink-0">{cmd.icon}</span>
                    <span className="flex-1 truncate">{cmd.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )
          })}
        </Command.List>
      </Command>
    </div>
  )
}
