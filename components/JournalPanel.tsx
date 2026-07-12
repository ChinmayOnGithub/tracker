"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { upsertJournalEntry, listJournalEntries, deleteJournalEntry } from '@/app/actions/journal'
import {
  BookOpen, Plus, Trash2, Heart, Lightbulb, Sunrise, Smile, ChevronDown, ChevronUp, Search, Calendar
} from 'lucide-react'
import { Input, Textarea, Button, Card } from '@/design-system'

interface JournalEntry {
  id: string
  journalDate: Date | string
  content: string
  mood: string | null
  gratitude: string | null
  reflections: string | null
  lessonsLearned: string | null
  tomorrowPlan: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

const MOOD_OPTIONS = [
  { emoji: '🤩', label: 'Amazing', value: 'amazing' },
  { emoji: '😊', label: 'Good', value: 'good' },
  { emoji: '😐', label: 'Neutral', value: 'neutral' },
  { emoji: '😔', label: 'Low', value: 'low' },
  { emoji: '😤', label: 'Frustrated', value: 'frustrated' },
]

function formatJournalDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function shortDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

function toYMD(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SaveBadge({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  const map = {
    saving: 'text-blue-500 animate-pulse',
    saved: 'text-emerald-500',
    error: 'text-red-500',
  } as const
  const labels = { saving: 'Saving…', saved: 'Saved', error: 'Save failed' } as const
  return (
    <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${map[status as keyof typeof map]}`}>
      {labels[status as keyof typeof labels]}
    </span>
  )
}

interface AutosaveTextareaProps {
  label: string
  icon: React.ReactNode
  value: string
  placeholder: string
  field: string
  date: string
  onSaved: (field: string, value: string) => void
}

function AutosaveTextarea({ label, icon, value: initialValue, placeholder, field, date, onSaved }: AutosaveTextareaProps) {
  const [value, setValue] = useState(initialValue)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const isSavingRef = useRef(false)
  const pendingRef = useRef<string | null>(null)

  useEffect(() => { setValue(initialValue) }, [initialValue])

  const save = useCallback(async (v: string) => {
    if (v === initialValue) return
    if (isSavingRef.current) { pendingRef.current = v; return }
    isSavingRef.current = true
    setStatus('saving')
    try {
      const res = await upsertJournalEntry(date, { [field]: v })
      if (res.success) { setStatus('saved'); onSaved(field, v) }
      else setStatus('error')
    } catch { setStatus('error') }
    finally {
      isSavingRef.current = false
      if (pendingRef.current !== null) {
        const next = pendingRef.current; pendingRef.current = null; save(next)
      }
    }
  }, [date, field, initialValue, onSaved])

  useEffect(() => {
    if (value === initialValue) return
    const t = setTimeout(() => save(value), 2000)
    return () => clearTimeout(t)
  }, [value, initialValue, save])

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
          {icon}{label}
        </label>
        <SaveBadge status={status} />
      </div>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setStatus('saving') }}
        onBlur={() => save(value)}
        placeholder={placeholder}
        className="w-full p-2.5 text-xs bg-[var(--color-bg-base)] border border-[var(--color-border)] focus:border-[var(--color-primary)] rounded-lg focus:outline-hidden transition-all duration-150 font-medium leading-relaxed resize-y h-16"
      />
    </div>
  )
}

interface JournalPanelProps {
  initialEntries: JournalEntry[]
}

export const JournalPanel: React.FC<JournalPanelProps> = ({ initialEntries }) => {
  const today = todayYMD()
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries)
  const [activeDate, setActiveDate] = useState<string>(today)
  const [search, setSearch] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Editor states for active date
  const activeEntry = entries.find(e => toYMD(e.journalDate) === activeDate) || null
  const [content, setContent] = useState(activeEntry?.content || '')
  const [mood, setMood] = useState(activeEntry?.mood || null)
  const [contentStatus, setContentStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const isSavingRef = useRef(false)
  const pendingRef = useRef<string | null>(null)

  // Sync editor when active date changes
  useEffect(() => {
    if (activeEntry) {
      setContent(activeEntry.content)
      setMood(activeEntry.mood)
    } else {
      setContent('')
      setMood(null)
    }
    setContentStatus('idle')
  }, [activeDate, activeEntry])

  // Save content callback
  const saveContent = useCallback(async (v: string) => {
    if (isSavingRef.current) { pendingRef.current = v; return }
    isSavingRef.current = true
    setContentStatus('saving')
    try {
      const res = await upsertJournalEntry(activeDate, { content: v })
      if (res.success && res.entry) {
        setContentStatus('saved')
        // Update local entries list
        setEntries(prev => {
          const idx = prev.findIndex(e => toYMD(e.journalDate) === activeDate)
          if (idx >= 0) {
            const copy = [...prev]
            copy[idx] = { ...copy[idx], content: v, id: res.entry.id }
            return copy
          }
          return [{
            id: res.entry.id,
            journalDate: activeDate + 'T12:00:00Z',
            content: v,
            mood: null,
            gratitude: null,
            reflections: null,
            lessonsLearned: null,
            tomorrowPlan: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }, ...prev]
        })
      } else {
        setContentStatus('error')
      }
    } catch {
      setContentStatus('error')
    } finally {
      isSavingRef.current = false
      if (pendingRef.current !== null) {
        const next = pendingRef.current; pendingRef.current = null; saveContent(next)
      }
    }
  }, [activeDate])

  // Debounced autosave
  useEffect(() => {
    const dbValue = activeEntry?.content || ''
    if (content === dbValue) return

    const t = setTimeout(() => saveContent(content), 2000)
    return () => clearTimeout(t)
  }, [content, activeEntry?.content, saveContent])

  const saveMood = async (m: string) => {
    setMood(m)
    const res = await upsertJournalEntry(activeDate, { mood: m })
    if (res.success && res.entry) {
      setEntries(prev => {
        const idx = prev.findIndex(e => toYMD(e.journalDate) === activeDate)
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = { ...copy[idx], mood: m, id: res.entry.id }
          return copy
        }
        return [{
          id: res.entry.id,
          journalDate: activeDate + 'T12:00:00Z',
          content: '',
          mood: m,
          gratitude: null,
          reflections: null,
          lessonsLearned: null,
          tomorrowPlan: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }, ...prev]
      })
    }
  }

  const handleFieldSaved = (field: string, value: string) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => toYMD(e.journalDate) === activeDate)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], [field]: value }
        return copy
      }
      return prev
    })
  }

  const handleDelete = async (id: string, dateStr: string) => {
    if (confirm('Are you sure you want to delete this journal entry?')) {
      await deleteJournalEntry(id)
      setEntries(prev => prev.filter(e => e.id !== id))
      if (activeDate === dateStr) {
        setActiveDate(today)
      }
    }
  }

  const handleNewEntry = () => {
    setActiveDate(today)
  }

  // Filter entries
  const filtered = entries.filter(e => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (e.content || '').toLowerCase().includes(q) ||
      (e.gratitude || '').toLowerCase().includes(q) ||
      (e.lessonsLearned || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex gap-6 min-h-[500px]">
      
      {/* LEFT SIDEBAR: Past notes list (Apple Notes style) */}
      <aside className="w-64 shrink-0 flex flex-col gap-3 pr-4 border-r border-[var(--color-border)]/60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
            Journal History
          </h3>
          <Button
            onClick={handleNewEntry}
            size="sm"
            variant="outline"
            icon={<Plus size={12} />}
          />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-[var(--color-bg-base)] border border-[var(--color-border)] pl-8 pr-3 py-1.5 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden font-medium"
          />
        </div>

        {/* Entries scrollable checklist */}
        <div className="flex-1 overflow-y-auto space-y-1 max-h-[450px] pr-1">
          {filtered.map(entry => {
            const dateStr = toYMD(entry.journalDate)
            const isActive = activeDate === dateStr
            const moodObj = MOOD_OPTIONS.find(m => m.value === entry.mood)
            const preview = (entry.content || 'Empty entry').slice(0, 45)

            return (
              <div
                key={entry.id}
                onClick={() => setActiveDate(dateStr)}
                className={`group flex items-start justify-between gap-2 p-2.5 rounded-lg cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-[var(--color-accent)] border-[var(--color-border)]'
                    : 'border-transparent hover:bg-[var(--color-accent)]/30'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {moodObj && <span className="text-xs">{moodObj.emoji}</span>}
                    <span className="text-[10px] font-bold text-[var(--color-text-main)]">
                      {shortDate(entry.journalDate)}
                    </span>
                  </div>
                  <p className="text-[9px] text-[var(--color-text-muted)] truncate mt-1">
                    {preview}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(entry.id, dateStr) }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-slate-105 transition-colors cursor-pointer"
                  title="Delete Entry"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="text-center text-[10px] text-[var(--color-text-muted)] py-8 italic">
              No entries found.
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT WORKSPACE: Apple Notes centered writing canvas */}
      <main className="flex-1 flex flex-col gap-5 px-2">
        
        {/* Editor Top Info Bar */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)]/40 pb-3">
          <div>
            <h1 className="text-base font-black text-[var(--color-text-main)] tracking-tight">
              {formatJournalDate(activeDate + 'T12:00:00Z')}
            </h1>
            <p className="text-[9px] text-[var(--color-text-muted)] font-medium mt-0.5">
              Autosaved to PostgreSQL ledger
            </p>
          </div>
          <SaveBadge status={contentStatus} />
        </div>

        {/* Mood Picker */}
        <div className="flex items-center gap-2.5">
          <Smile className="w-4 h-4 text-[var(--color-text-muted)]" />
          <div className="flex gap-1.5 flex-wrap">
            {MOOD_OPTIONS.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => saveMood(m.value)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                  mood === m.value
                    ? 'bg-[var(--color-accent)] text-[var(--color-text-main)] border-[var(--color-border)]'
                    : 'bg-transparent text-[var(--color-text-muted)] border-transparent hover:bg-[var(--color-accent)]/40'
                }`}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Large Focused Writing Sheet (Apple Notes style) */}
        <div className="flex-1 flex flex-col min-h-[250px]">
          <textarea
            value={content}
            onChange={e => { setContent(e.target.value); setContentStatus('saving') }}
            onBlur={() => saveContent(content)}
            placeholder="Start writing your thoughts, feelings, and reflection today..."
            className="w-full flex-1 bg-transparent text-sm text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-hidden leading-relaxed resize-none font-medium pr-2 min-h-[200px]"
          />
        </div>

        {/* Structured Questions Accordion */}
        <div className="border-t border-[var(--color-border)]/60 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors cursor-pointer select-none"
          >
            <span>Structured Reflections</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 mt-1 border-t border-dashed border-[var(--color-border)]">
              <AutosaveTextarea
                label="Gratitude"
                icon={<Heart className="w-3 h-3" />}
                value={activeEntry?.gratitude ?? ''}
                placeholder="What are you grateful for today?"
                field="gratitude"
                date={activeDate}
                onSaved={handleFieldSaved}
              />
              <AutosaveTextarea
                label="Insights & Reflections"
                icon={<BookOpen className="w-3 h-3" />}
                value={activeEntry?.reflections ?? ''}
                placeholder="What stood out? What did you notice?"
                field="reflections"
                date={activeDate}
                onSaved={handleFieldSaved}
              />
              <AutosaveTextarea
                label="Lessons Learned"
                icon={<Lightbulb className="w-3 h-3" />}
                value={activeEntry?.lessonsLearned ?? ''}
                placeholder="What did you learn today?"
                field="lessonsLearned"
                date={activeDate}
                onSaved={handleFieldSaved}
              />
              <AutosaveTextarea
                label="Tomorrow's Plan"
                icon={<Sunrise className="w-3 h-3" />}
                value={activeEntry?.tomorrowPlan ?? ''}
                placeholder="What's the most important thing for tomorrow?"
                field="tomorrowPlan"
                date={activeDate}
                onSaved={handleFieldSaved}
              />
            </div>
          )}
        </div>

      </main>

    </div>
  )
}

