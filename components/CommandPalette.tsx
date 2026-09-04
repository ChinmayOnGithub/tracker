"use client"
import React, { useMemo, useState, useEffect } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store/store'
import {
  Calendar, FileText, CheckSquare, Scale, Briefcase,
  Plus, Settings, LayoutDashboard, BookOpen, Link as LinkIcon,
  LogIn, LogOut, Timer, ExternalLink, Search, Folder,
  Palette, Bell, RefreshCw, Lock, Database, User, ShieldCheck,
  Sparkles
} from 'lucide-react'
import { MasterSearchEngine, SearchResult } from '@/lib/search/MasterSearchEngine'

// ─── Public interface ─────────────────────────────────────────────────────────

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
  action: (props: CommandPaletteProps, router: ReturnType<typeof useRouter>) => void
}

const COMMANDS: TrackerCommand[] = [
  // Navigation
  {
    id: 'go-today',
    label: 'Go to Today',
    group: 'Navigation',
    icon: <LayoutDashboard className="w-4 h-4 text-[var(--color-primary)]" />,
    keywords: 'home dashboard today timeline overview',
    action: ({ onNavigate, onClose }) => { onNavigate('today'); onClose() },
  },
  {
    id: 'go-calendar',
    label: 'Go to Calendar',
    group: 'Navigation',
    icon: <Calendar className="w-4 h-4 text-blue-500" />,
    keywords: 'calendar schedule events google agenda month week day',
    action: ({ onNavigate, onClose }) => { onNavigate('calendar'); onClose() },
  },
  {
    id: 'go-activities',
    label: 'Go to Activities',
    group: 'Navigation',
    icon: <CheckSquare className="w-4 h-4 text-amber-500" />,
    keywords: 'activities tasks habits recurring routines templates tracker',
    action: ({ onNavigate, onClose }) => { onNavigate('activities'); onClose() },
  },
  {
    id: 'go-journal',
    label: 'Go to Journal',
    group: 'Navigation',
    icon: <BookOpen className="w-4 h-4 text-teal-500" />,
    keywords: 'journal diary daily thoughts memories gratitude reflection',
    action: ({ onNavigate, onClose }) => { onNavigate('journal'); onClose() },
  },
  {
    id: 'go-notes',
    label: 'Go to Notes',
    group: 'Navigation',
    icon: <FileText className="w-4 h-4 text-emerald-500" />,
    keywords: 'notes scratchpad thought quick memos ideas document writing',
    action: ({ onNavigate, onClose }) => { onNavigate('notes'); onClose() },
  },
  {
    id: 'go-work',
    label: 'Go to Work Tracker',
    group: 'Navigation',
    icon: <Timer className="w-4 h-4 text-green-500" />,
    keywords: 'work hours tracker sessions timer attendance office wfh presence',
    action: ({ onNavigate, onClose }) => { onNavigate('work'); onClose() },
  },
  {
    id: 'go-leave',
    label: 'Go to Time Off',
    group: 'Navigation',
    icon: <Briefcase className="w-4 h-4 text-purple-500" />,
    keywords: 'leave vacation time off pto sick holiday absence balance',
    action: ({ onNavigate, onClose }) => { onNavigate('leave'); onClose() },
  },
  {
    id: 'go-weight',
    label: 'Go to Weight',
    group: 'Navigation',
    icon: <Scale className="w-4 h-4 text-indigo-500" />,
    keywords: 'weight health bmi fitness scale log kilograms pounds',
    action: ({ onNavigate, onClose }) => { onNavigate('weight'); onClose() },
  },
  {
    id: 'go-links',
    label: 'Go to Links',
    group: 'Navigation',
    icon: <LinkIcon className="w-4 h-4 text-cyan-500" />,
    keywords: 'links bookmarks library collections url websites resources',
    action: ({ onNavigate, onClose }) => { onNavigate('links'); onClose() },
  },
  {
    id: 'go-vault',
    label: 'Go to Vault',
    group: 'Navigation',
    icon: <Folder className="w-4 h-4 text-rose-500" />,
    keywords: 'vault documents secure files aadhaar pan passport pdf id storage',
    action: ({ onNavigate, onClose }) => { onNavigate('documents'); onClose() },
  },
  {
    id: 'go-settings',
    label: 'Open Settings',
    group: 'Navigation',
    icon: <Settings className="w-4 h-4 text-[var(--color-text-muted)]" />,
    keywords: 'settings preferences config profile theme appearance colors guest personal center',
    action: ({ onNavigate, onClose }) => { onNavigate('settings'); onClose() },
  },
  // Settings & Preferences
  {
    id: 'settings-appearance',
    label: 'Settings: Appearance & Theme',
    group: 'Settings',
    icon: <Palette className="w-4 h-4 text-purple-500" />,
    keywords: 'appearance theme colors accent font size dark light mode rounded corners styling personal customize',
    action: ({ onClose }, router) => { router.push('/settings?tab=appearance'); onClose() },
  },
  {
    id: 'settings-profile',
    label: 'Settings: Profile & Account',
    group: 'Settings',
    icon: <User className="w-4 h-4 text-blue-500" />,
    keywords: 'profile account username email timezone country birthday date time format pin passcode',
    action: ({ onClose }, router) => { router.push('/settings?tab=profile'); onClose() },
  },
  {
    id: 'settings-calendar',
    label: 'Settings: Calendar & Working Hours',
    group: 'Settings',
    icon: <Calendar className="w-4 h-4 text-amber-500" />,
    keywords: 'calendar view agenda week month start of week working hours default task duration weekly goal',
    action: ({ onClose }, router) => { router.push('/settings?tab=calendar'); onClose() },
  },
  {
    id: 'settings-dashboard',
    label: 'Settings: Dashboard Widgets & Modules',
    group: 'Settings',
    icon: <LayoutDashboard className="w-4 h-4 text-emerald-500" />,
    keywords: 'dashboard widgets visibility modules personal toggle leetcode gfg tasks work hours leave',
    action: ({ onClose }, router) => { router.push('/settings?tab=dashboard'); onClose() },
  },
  {
    id: 'settings-notifications',
    label: 'Settings: Notifications & Sounds',
    group: 'Settings',
    icon: <Bell className="w-4 h-4 text-yellow-500" />,
    keywords: 'notifications sound browser alerts summary missed task reminders audio',
    action: ({ onClose }, router) => { router.push('/settings?tab=notifications'); onClose() },
  },
  {
    id: 'settings-integrations',
    label: 'Settings: Integrations (Google Calendar)',
    group: 'Settings',
    icon: <RefreshCw className="w-4 h-4 text-cyan-500" />,
    keywords: 'integrations google calendar sync account connection sync agenda oauth',
    action: ({ onClose }, router) => { router.push('/settings?tab=integrations'); onClose() },
  },
  {
    id: 'settings-security',
    label: 'Settings: Security & Passcode',
    group: 'Settings',
    icon: <Lock className="w-4 h-4 text-rose-500" />,
    keywords: 'security passcode pin timeout session lock privacy authentication',
    action: ({ onClose }, router) => { router.push('/settings?tab=security'); onClose() },
  },
  {
    id: 'settings-backup',
    label: 'Settings: Backup & Recovery',
    group: 'Settings',
    icon: <Database className="w-4 h-4 text-teal-500" />,
    keywords: 'backup export import restore recovery json database local data snapshot',
    action: ({ onClose }, router) => { router.push('/settings?tab=backup'); onClose() },
  },
  {
    id: 'settings-admin',
    label: 'Settings: Guest Access Admin',
    group: 'Settings',
    icon: <ShieldCheck className="w-4 h-4 text-indigo-500" />,
    keywords: 'guest access permissions admin shared user roles authorization',
    action: ({ onClose }, router) => { router.push('/settings?tab=admin'); onClose() },
  },
  {
    id: 'settings-advanced',
    label: 'Settings: Advanced & Developer Mode',
    group: 'Settings',
    icon: <Sparkles className="w-4 h-4 text-orange-500" />,
    keywords: 'advanced developer mode experimental debug offline status reset factory defaults',
    action: ({ onClose }, router) => { router.push('/settings?tab=advanced'); onClose() },
  },
  // Actions
  {
    id: 'new-activity',
    label: 'Create Activity / Task',
    group: 'Actions',
    icon: <Plus className="w-4 h-4 text-emerald-500" />,
    keywords: 'new create activity task habit template reminder schedule',
    action: ({ onNewActivity, onClose }) => { onNewActivity(); onClose() },
  },
  {
    id: 'new-journal',
    label: 'Open Journal for Today',
    group: 'Actions',
    icon: <BookOpen className="w-4 h-4 text-teal-500" />,
    keywords: 'write journal entry today new memo reflection',
    action: ({ onNavigate, onClose }) => { onNavigate('journal'); onClose() },
  },
  {
    id: 'new-note',
    label: 'Open Notes Workspace',
    group: 'Actions',
    icon: <FileText className="w-4 h-4 text-emerald-500" />,
    keywords: 'create note write thoughts draft document',
    action: ({ onNavigate, onClose }) => { onNavigate('notes'); onClose() },
  },
  {
    id: 'log-weight',
    label: 'Log Weight Entry',
    group: 'Actions',
    icon: <Scale className="w-4 h-4 text-indigo-500" />,
    keywords: 'log weight track health scale progress metrics',
    action: ({ onNavigate, onClose }) => { onNavigate('weight'); onClose() },
  },
  {
    id: 'request-leave',
    label: 'Request Time Off',
    group: 'Actions',
    icon: <LogOut className="w-4 h-4 text-purple-500" />,
    keywords: 'request leave time off vacation sick pto holiday',
    action: ({ onNavigate, onClose }) => { onNavigate('leave'); onClose() },
  },
  {
    id: 'start-work',
    label: 'Log Work Presence',
    group: 'Actions',
    icon: <LogIn className="w-4 h-4 text-green-500" />,
    keywords: 'start work log hours presence office wfh checkin clock',
    action: ({ onNavigate, onClose }) => { onNavigate('today'); onClose() },
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export const CommandPalette: React.FC<CommandPaletteProps> = (props) => {
  const { isOpen, onClose } = props
  const router = useRouter()
  const { state, setActiveJournalDateAction } = useStore()
  const [mounted, setMounted] = useState(false)
  const [rawSearch, setRawSearch] = useState('')
  const [prevOpen, setPrevOpen] = useState(isOpen)

  // Prevent React #418 hydration mismatch — cmdk uses aria-live regions that differ SSR vs client.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (!isOpen) {
      setRawSearch('')
    }
  }

  const search = isOpen ? rawSearch : ''
  const setSearch = setRawSearch

  // Live filtered data results using MasterSearchEngine
  const dataResults = useMemo(() => {
    if (!search.trim()) {
      return { notes: [], journal: [], tasks: [], links: [], vault: [], weight: [], leave: [] }
    }

    const allResults = MasterSearchEngine.search(search, state, 'all')
    const map: {
      notes: SearchResult[]
      journal: SearchResult[]
      tasks: SearchResult[]
      links: SearchResult[]
      vault: SearchResult[]
      weight: SearchResult[]
      leave: SearchResult[]
    } = {
      notes: [],
      journal: [],
      tasks: [],
      links: [],
      vault: [],
      weight: [],
      leave: [],
    }

    for (const item of allResults) {
      if (item.type === 'note') map.notes.push(item)
      else if (item.type === 'journal') map.journal.push(item)
      else if (item.type === 'activity') map.tasks.push(item)
      else if (item.type === 'link') map.links.push(item)
      else if (item.type === 'document') map.vault.push(item)
      else if (item.type === 'weight') map.weight.push(item)
      else if (item.type === 'leave') map.leave.push(item)
    }

    return map
  }, [search, state])

  if (!isOpen || !mounted) return null

  // Command groups
  const groups = Array.from(new Set(COMMANDS.map(c => c.group)))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-24 px-4 bg-slate-900/40 dark:bg-black/70 backdrop-blur-md"
      aria-label="Master Search & Command palette"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 cursor-default" onClick={onClose} aria-hidden />

      {/* cmdk dialog */}
      <Command
        label="Universal Search & Command palette"
        className={[
          'relative w-full max-w-xl overflow-hidden',
          'bg-[var(--color-bg-surface)] border border-[var(--color-border)]',
          'rounded-2xl shadow-2xl flex flex-col',
          'max-h-[520px]',
          'animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-200',
        ].join(' ')}
        // Dismiss on Escape
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
      >
        {/* Search input bar */}
        <div className="flex items-center gap-3 px-4 border-b border-[var(--color-border)] h-13 shrink-0 bg-[var(--color-bg-subtle)]/30">
          <Search className="w-4.5 h-4.5 text-[var(--color-text-muted)] shrink-0" />
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Search notes, journal, tasks, files, links, weight, or commands…"
            className={[
              'flex-1 bg-transparent text-xs sm:text-sm font-semibold',
              'text-[var(--color-text-main)]',
              'placeholder:text-[var(--color-text-muted)]',
              'focus:outline-none',
            ].join(' ')}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] px-1.5 py-0.5 rounded bg-[var(--color-bg-base)] border border-[var(--color-border)] cursor-pointer"
            >
              Clear
            </button>
          )}
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-bold font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <Command.List className="flex-1 overflow-y-auto py-2 px-2 space-y-3">
          <Command.Empty className="py-10 text-center text-xs text-[var(--color-text-muted)] font-medium italic">
            {search.trim() ? 'No matches found' : 'Type anything to search across all data…'}
          </Command.Empty>

          {/* ── NOTES RESULTS ── */}
          {dataResults.notes.length > 0 && (
            <Command.Group
              heading="Notes"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-emerald-500"
            >
              {dataResults.notes.map(note => (
                <Command.Item
                  key={note.id}
                  value={`${note.title} ${note.snippet || ''}`}
                  onSelect={() => {
                    router.push(note.href)
                    onClose()
                  }}
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
                  <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold text-xs">{note.title}</span>
                    {note.snippet && (
                      <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                        {note.snippet}
                      </span>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── JOURNAL RESULTS ── */}
          {dataResults.journal.length > 0 && (
            <Command.Group
              heading="Journal Entries"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-teal-500"
            >
              {dataResults.journal.map(entry => (
                <Command.Item
                  key={entry.id}
                  value={`${entry.title} ${entry.subtitle || ''} ${entry.snippet || ''}`}
                  onSelect={() => {
                    if (entry.payload?.date) {
                      setActiveJournalDateAction(entry.payload.date)
                    }
                    router.push(entry.href)
                    onClose()
                  }}
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
                  <BookOpen className="w-4 h-4 text-teal-500 shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold text-xs">{entry.title} {entry.subtitle ? `· ${entry.subtitle}` : ''}</span>
                    {entry.snippet && (
                      <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                        {entry.snippet}
                      </span>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── ACTIVITIES RESULTS ── */}
          {dataResults.tasks.length > 0 && (
            <Command.Group
              heading="Activities"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-amber-500"
            >
              {dataResults.tasks.map(task => (
                <Command.Item
                  key={task.id}
                  value={`${task.title} ${task.subtitle || ''} ${task.snippet || ''}`}
                  onSelect={() => {
                    router.push(task.href)
                    onClose()
                  }}
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
                  <CheckSquare className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold text-xs">{task.title}</span>
                    <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {task.subtitle} {task.snippet ? `· ${task.snippet}` : ''}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── LINKS & BOOKMARKS RESULTS ── */}
          {dataResults.links.length > 0 && (
            <Command.Group
              heading="Links & Bookmarks"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-cyan-500"
            >
              {dataResults.links.map(link => (
                <Command.Item
                  key={link.id}
                  value={`${link.title} ${link.subtitle || ''} ${link.snippet || ''}`}
                  onSelect={() => {
                    if (link.payload?.externalUrl && (link.payload.externalUrl.startsWith('http://') || link.payload.externalUrl.startsWith('https://'))) {
                      window.open(link.payload.externalUrl, '_blank', 'noopener,noreferrer')
                    } else {
                      router.push(link.href)
                    }
                    onClose()
                  }}
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
                  <LinkIcon className="w-4 h-4 text-cyan-500 shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="truncate font-bold text-xs">{link.title}</span>
                      <ExternalLink className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />
                    </div>
                    <span className="truncate text-[10px] text-[var(--color-text-muted)] font-mono">
                      {link.subtitle || link.snippet}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── VAULT DOCUMENTS RESULTS ── */}
          {dataResults.vault.length > 0 && (
            <Command.Group
              heading="Documents & Vault"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-rose-500"
            >
              {dataResults.vault.map(item => (
                <Command.Item
                  key={item.id}
                  value={`${item.title} ${item.subtitle || ''}`}
                  onSelect={() => {
                    router.push(item.href)
                    onClose()
                  }}
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
                  <Folder className="w-4 h-4 text-rose-500 shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold text-xs">{item.title}</span>
                    <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {item.subtitle}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── WEIGHT LOGS RESULTS ── */}
          {dataResults.weight.length > 0 && (
            <Command.Group
              heading="Weight & Health"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-indigo-500"
            >
              {dataResults.weight.map(rec => (
                <Command.Item
                  key={rec.id}
                  value={`${rec.title} ${rec.subtitle || ''} ${rec.snippet || ''}`}
                  onSelect={() => {
                    router.push(rec.href)
                    onClose()
                  }}
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
                  <Scale className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold text-xs">{rec.title} · {rec.subtitle}</span>
                    {rec.snippet && (
                      <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                        {rec.snippet}
                      </span>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── TIME OFF / LEAVE RESULTS ── */}
          {dataResults.leave.length > 0 && (
            <Command.Group
              heading="Time Off / Leave"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-purple-500"
            >
              {dataResults.leave.map(record => (
                <Command.Item
                  key={record.id}
                  value={`${record.title} ${record.subtitle || ''} ${record.snippet || ''}`}
                  onSelect={() => {
                    router.push(record.href)
                    onClose()
                  }}
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
                  <Briefcase className="w-4 h-4 text-purple-500 shrink-0" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold text-xs">{record.title}</span>
                    <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {record.subtitle}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── STANDARD NAVIGATION & SYSTEM COMMANDS ── */}
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
                    onSelect={() => cmd.action(props, router)}
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

