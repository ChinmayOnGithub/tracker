"use client"
import React, { useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store/store'
import {
  Calendar, FileText, CheckSquare, Scale, Briefcase,
  Plus, Settings, LayoutDashboard, BookOpen, Link as LinkIcon,
  LogIn, LogOut, Timer, ExternalLink, Search, Folder
} from 'lucide-react'
import { toYMD, fmtDateMed } from '@/lib/dateUtils'

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

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
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
    keywords: 'settings preferences config profile theme appearance colors guest',
    action: ({ onNavigate, onClose }) => { onNavigate('settings'); onClose() },
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
  const { isOpen, onClose, onNavigate } = props
  const router = useRouter()
  const { state, setActiveJournalDateAction } = useStore()
  const [rawSearch, setRawSearch] = useState('')
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (!isOpen) {
      setRawSearch('')
    }
  }

  const search = isOpen ? rawSearch : ''
  const setSearch = setRawSearch

  // Aggregate and index real-time matching data
  const dataResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return {
        notes: [],
        journal: [],
        tasks: [],
        links: [],
        vault: [],
        weight: [],
        leave: [],
      }
    }

    // 1. Notes matches
    const matchedNotes = state.notes
      .filter(n => {
        const titleMatch = (n.title || '').toLowerCase().includes(q)
        const contentMatch = stripHtml(n.content || '').toLowerCase().includes(q)
        return titleMatch || contentMatch
      })
      .slice(0, 5)

    // 2. Journal matches
    const matchedJournal = state.journalEntries
      .filter(j => {
        const dateStr = toYMD(j.journalDate)
        const dateMatch = dateStr.includes(q)
        const contentMatch = stripHtml(j.content || '').toLowerCase().includes(q)
        const moodMatch = (j.mood || '').toLowerCase().includes(q)
        const reflectMatch = (j.reflections || '').toLowerCase().includes(q)
        const gratitudeMatch = (j.gratitude || '').toLowerCase().includes(q)
        const lessonsMatch = (j.lessonsLearned || '').toLowerCase().includes(q)
        const tomorrowMatch = (j.tomorrowPlan || '').toLowerCase().includes(q)
        return dateMatch || contentMatch || moodMatch || reflectMatch || gratitudeMatch || lessonsMatch || tomorrowMatch
      })
      .slice(0, 5)

    // 3. Task / Activity templates
    const matchedTasks = state.templates
      .filter(t => {
        const nameMatch = (t.name || '').toLowerCase().includes(q)
        const catMatch = (t.category || '').toLowerCase().includes(q)
        const notesMatch = (t.notes || '').toLowerCase().includes(q)
        const typeMatch = (t.type || '').toLowerCase().includes(q)
        return nameMatch || catMatch || notesMatch || typeMatch
      })
      .slice(0, 5)

    // 4. Links / Bookmarks
    const matchedLinks = state.links
      .filter(l => {
        const titleMatch = (l.title || '').toLowerCase().includes(q)
        const urlMatch = (l.url || '').toLowerCase().includes(q)
        const descMatch = (l.description || '').toLowerCase().includes(q)
        return titleMatch || urlMatch || descMatch
      })
      .slice(0, 5)

    // 5. Vault files / folders
    const matchedVault = state.vaultItems
      .filter(v => {
        const nameMatch = (v.name || '').toLowerCase().includes(q)
        const groupMatch = (v.mimeGroup || '').toLowerCase().includes(q)
        return nameMatch || groupMatch
      })
      .slice(0, 5)

    // 6. Weight logs
    const matchedWeight = state.weightRecords
      .filter(w => {
        const dateStr = typeof w.date === 'string' ? w.date : toYMD(w.date)
        const dateMatch = dateStr.includes(q)
        const weightMatch = `${w.weight} kg`.includes(q) || `${w.weight}`.includes(q)
        const notesMatch = (w.notes || '').toLowerCase().includes(q)
        return dateMatch || weightMatch || notesMatch
      })
      .slice(0, 4)

    // 7. Leave records
    const matchedLeave = state.leaveRecords
      .filter(lr => {
        const typeMatch = (lr.leaveType || '').toLowerCase().includes(q)
        const statusMatch = (lr.status || '').toLowerCase().includes(q)
        const notesMatch = (lr.notes || '').toLowerCase().includes(q)
        const startStr = typeof lr.startDate === 'string' ? lr.startDate : toYMD(lr.startDate)
        const endStr = typeof lr.endDate === 'string' ? lr.endDate : toYMD(lr.endDate)
        return typeMatch || statusMatch || notesMatch || startStr.includes(q) || endStr.includes(q)
      })
      .slice(0, 4)

    return {
      notes: matchedNotes,
      journal: matchedJournal,
      tasks: matchedTasks,
      links: matchedLinks,
      vault: matchedVault,
      weight: matchedWeight,
      leave: matchedLeave,
    }
  }, [search, state])

  if (!isOpen) return null

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
            {search.trim() ? `No matches found for "${search}"` : 'Type anything to search across all data…'}
          </Command.Empty>

          {/* ── NOTES RESULTS ── */}
          {dataResults.notes.length > 0 && (
            <Command.Group
              heading="Notes"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-emerald-500"
            >
              {dataResults.notes.map(note => {
                const snippet = stripHtml(note.content || '') || 'Empty note'
                const displayTitle = note.title?.trim() || snippet.slice(0, 32) || 'Untitled Note'

                return (
                  <Command.Item
                    key={note.id}
                    value={`note ${note.title || ''} ${snippet} ${note.id}`}
                    onSelect={() => {
                      router.push(`/notes?id=${note.id}`)
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
                      <span className="truncate font-bold text-xs">{displayTitle}</span>
                      <span className="truncate text-[10px] text-[var(--color-text-muted)] group-aria-selected:text-white/80">
                        {snippet}
                      </span>
                    </div>
                  </Command.Item>
                )
              })}
            </Command.Group>
          )}

          {/* ── JOURNAL RESULTS ── */}
          {dataResults.journal.length > 0 && (
            <Command.Group
              heading="Journal Entries"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-teal-500"
            >
              {dataResults.journal.map(entry => {
                const dateStr = toYMD(entry.journalDate)
                const snippet = stripHtml(entry.content || '') || entry.reflections || entry.gratitude || 'Daily reflection'

                return (
                  <Command.Item
                    key={entry.id}
                    value={`journal ${dateStr} ${entry.mood || ''} ${snippet}`}
                    onSelect={() => {
                      setActiveJournalDateAction(dateStr)
                      router.push(`/journal?date=${dateStr}`)
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
                      <span className="truncate font-bold text-xs">{fmtDateMed(entry.journalDate)} {entry.mood ? `· ${entry.mood}` : ''}</span>
                      <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                        {snippet}
                      </span>
                    </div>
                  </Command.Item>
                )
              })}
            </Command.Group>
          )}

          {/* ── ACTIVITIES / TASKS RESULTS ── */}
          {dataResults.tasks.length > 0 && (
            <Command.Group
              heading="Activities & Tasks"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-amber-500"
            >
              {dataResults.tasks.map(task => (
                <Command.Item
                  key={task.id}
                  value={`activity task ${task.name} ${task.category} ${task.notes || ''}`}
                  onSelect={() => {
                    onNavigate('activities')
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
                    <span className="truncate font-bold text-xs">{task.name}</span>
                    <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {task.category} · {task.recurrenceType} {task.notes ? `· ${task.notes}` : ''}
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
                  value={`link bookmark ${link.title} ${link.url} ${link.description || ''}`}
                  onSelect={() => {
                    if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
                      window.open(link.url, '_blank', 'noopener,noreferrer')
                    } else {
                      onNavigate('links')
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
                      {link.url}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* ── VAULT DOCUMENTS RESULTS ── */}
          {dataResults.vault.length > 0 && (
            <Command.Group
              heading="Vault Documents"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-rose-500"
            >
              {dataResults.vault.map(item => (
                <Command.Item
                  key={item.id}
                  value={`vault document ${item.name} ${item.mimeGroup || ''}`}
                  onSelect={() => {
                    onNavigate('documents')
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
                  {item.isFolder ? <Folder className="w-4 h-4 text-rose-500 shrink-0" /> : <FileText className="w-4 h-4 text-rose-500 shrink-0" />}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="truncate font-bold text-xs">{item.name}</span>
                    <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                      {item.isFolder ? 'Folder' : `${item.mimeGroup || 'File'}`}
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
              {dataResults.weight.map(rec => {
                const dateStr = typeof rec.date === 'string' ? rec.date : toYMD(rec.date)

                return (
                  <Command.Item
                    key={rec.id}
                    value={`weight health ${dateStr} ${rec.weight} ${rec.notes || ''}`}
                    onSelect={() => {
                      onNavigate('weight')
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
                      <span className="truncate font-bold text-xs">{rec.weight} kg · {fmtDateMed(rec.date)}</span>
                      {rec.notes && (
                        <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                          {rec.notes}
                        </span>
                      )}
                    </div>
                  </Command.Item>
                )
              })}
            </Command.Group>
          )}

          {/* ── TIME OFF / LEAVE RESULTS ── */}
          {dataResults.leave.length > 0 && (
            <Command.Group
              heading="Time Off / Leave"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-extrabold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-purple-500"
            >
              {dataResults.leave.map(record => {
                const start = typeof record.startDate === 'string' ? record.startDate : toYMD(record.startDate)
                const end = typeof record.endDate === 'string' ? record.endDate : toYMD(record.endDate)

                return (
                  <Command.Item
                    key={record.id}
                    value={`leave vacation pto ${record.leaveType} ${start} ${end} ${record.status} ${record.notes || ''}`}
                    onSelect={() => {
                      onNavigate('leave')
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
                      <span className="truncate font-bold text-xs capitalize">{record.leaveType} ({record.totalDays}d) · {record.status}</span>
                      <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                        {start} to {end} {record.notes ? `· ${record.notes}` : ''}
                      </span>
                    </div>
                  </Command.Item>
                )
              })}
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

