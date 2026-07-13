"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { upsertJournalEntry, deleteJournalEntry } from '@/app/actions/journal'
import {
  BookOpen, Trash2, Heart, Lightbulb, Sunrise, Smile, Search, ChevronDown, CheckCircle2, Cloud, CloudOff, Loader2, Edit3, PlusCircle
} from 'lucide-react'
import { Button } from '@/design-system'

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
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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

function SyncStatus({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium transition-all text-slate-400 dark:text-zinc-500">
      {status === 'saving' && <><Loader2 size={12} className="animate-spin" /> Saving...</>}
      {status === 'saved' && <><CheckCircle2 size={12} className="text-emerald-500" /> Saved</>}
      {status === 'error' && <><CloudOff size={12} className="text-rose-500" /> Offline</>}
    </div>
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
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue)

  if (initialValue !== prevInitialValue) {
    setValue(initialValue)
    setPrevInitialValue(initialValue)
  }

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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
    const t = setTimeout(() => save(value), 1500)
    return () => clearTimeout(t)
  }, [value, initialValue, save])

  return (
    <div className="flex flex-col gap-2 bg-slate-50/50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 transition-all hover:bg-slate-50 dark:hover:bg-zinc-900 group">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 dark:text-zinc-400">
          <span className="text-slate-400 dark:text-zinc-500 group-hover:text-[var(--color-primary)] transition-colors">{icon}</span> {label}
        </label>
        <SyncStatus status={status} />
      </div>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setStatus('saving') }}
        onBlur={() => save(value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-hidden resize-none leading-relaxed min-h-[60px]"
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
  const [prevActiveDate, setPrevActiveDate] = useState(activeDate)
  const [prevActiveEntryId, setPrevActiveEntryId] = useState(activeEntry?.id)

  if (activeDate !== prevActiveDate || activeEntry?.id !== prevActiveEntryId) {
    setContent(activeEntry?.content || '')
    setMood(activeEntry?.mood || null)
    setContentStatus('idle')
    setPrevActiveDate(activeDate)
    setPrevActiveEntryId(activeEntry?.id)
  }

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const saveContent = useCallback(async (v: string) => {
    if (isSavingRef.current) { pendingRef.current = v; return }
    isSavingRef.current = true
    setContentStatus('saving')
    try {
      const res = await upsertJournalEntry(activeDate, { content: v })
      if (res.success && res.entry) {
        setContentStatus('saved')
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
            content: v, mood: null, gratitude: null, reflections: null, lessonsLearned: null, tomorrowPlan: null,
            createdAt: new Date(), updatedAt: new Date()
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
    const t = setTimeout(() => saveContent(content), 1500)
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
          content: '', mood: m, gratitude: null, reflections: null, lessonsLearned: null, tomorrowPlan: null,
          createdAt: new Date(), updatedAt: new Date()
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
      if (activeDate === dateStr) setActiveDate(today)
    }
  }

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
    <div className="flex h-full min-h-[70vh] bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-xs">
      
      {/* ── LEFT SIDEBAR: History ── */}
      <aside className="w-72 shrink-0 flex flex-col bg-slate-50/50 dark:bg-zinc-900/40 border-r border-slate-200 dark:border-zinc-800">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black tracking-tight text-[var(--color-text-main)]">Journal</h3>
            <button
              onClick={() => setActiveDate(today)}
              className="text-[var(--color-primary)] p-1.5 hover:bg-[var(--color-primary)]/10 rounded-full transition-colors"
              title="New Entry (Today)"
            >
              <Edit3 size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[var(--color-primary)] transition-colors" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search journal..."
              className="w-full bg-slate-200/50 dark:bg-zinc-800/80 border-none pl-9 pr-4 py-2 rounded-xl text-sm placeholder-slate-500 dark:placeholder-zinc-500 focus:outline-hidden focus:ring-2 focus:ring-[var(--color-primary)]/30 font-medium transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-4 px-2 space-y-0.5">
          {filtered.map(entry => {
            const dateStr = toYMD(entry.journalDate)
            const isActive = activeDate === dateStr
            const moodObj = MOOD_OPTIONS.find(m => m.value === entry.mood)
            const preview = entry.content || 'No text written.'

            return (
              <div
                key={entry.id}
                onClick={() => setActiveDate(dateStr)}
                className={`group relative flex flex-col gap-1 px-3 py-3 rounded-xl cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-main)] hover:bg-slate-200/50 dark:hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[13px] font-bold ${isActive ? 'text-white' : 'text-[var(--color-text-main)]'}`}>
                    {shortDate(entry.journalDate)}
                  </span>
                  {moodObj && <span className="text-xs opacity-90">{moodObj.emoji}</span>}
                </div>
                <p className={`text-xs line-clamp-2 leading-relaxed ${isActive ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`}>
                  {preview}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(entry.id, dateStr) }}
                  className={`absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-colors ${
                    isActive ? 'text-white hover:bg-white/20' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                  }`}
                  title="Delete Entry"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-[var(--color-text-muted)] py-8 font-medium">
              No entries found.
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT WORKSPACE: Canvas ── */}
      <main className="flex-1 flex flex-col bg-white dark:bg-[#09090b] relative">
        <div className="flex-1 overflow-y-auto px-8 md:px-16 lg:px-24 py-12 pb-24">
          
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
            
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-black text-[var(--color-text-main)] tracking-tight">
                {formatJournalDate(activeDate + 'T12:00:00Z')}
              </h1>
              <SyncStatus status={contentStatus} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {MOOD_OPTIONS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => saveMood(m.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all transform active:scale-95 cursor-pointer ${
                    mood === m.value
                      ? 'bg-[var(--color-text-main)] text-[var(--color-bg-base)] shadow-sm'
                      : 'bg-slate-100 dark:bg-zinc-900 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 hover:text-[var(--color-text-main)]'
                  }`}
                >
                  <span className="text-sm">{m.emoji}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setContentStatus('saving') }}
              onBlur={() => saveContent(content)}
              placeholder="Start writing..."
              className="w-full mt-4 bg-transparent text-base text-[var(--color-text-main)] placeholder-slate-300 dark:placeholder-zinc-700 focus:outline-hidden leading-[1.8] resize-none font-medium min-h-[300px]"
            />

            <div className="mt-8 pt-8 border-t border-slate-100 dark:border-zinc-900">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-bold text-slate-400 dark:text-zinc-500 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
              >
                <span className="bg-slate-100 dark:bg-zinc-900 p-1 rounded-md"><PlusCircle size={14} /></span>
                Structured Prompts
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <AutosaveTextarea
                    label="Gratitude"
                    icon={<Heart size={14} />}
                    value={activeEntry?.gratitude ?? ''}
                    placeholder="I am grateful for..."
                    field="gratitude"
                    date={activeDate}
                    onSaved={handleFieldSaved}
                  />
                  <AutosaveTextarea
                    label="Insights & Reflections"
                    icon={<BookOpen size={14} />}
                    value={activeEntry?.reflections ?? ''}
                    placeholder="What did I notice today?"
                    field="reflections"
                    date={activeDate}
                    onSaved={handleFieldSaved}
                  />
                  <AutosaveTextarea
                    label="Lessons Learned"
                    icon={<Lightbulb size={14} />}
                    value={activeEntry?.lessonsLearned ?? ''}
                    placeholder="What did I learn?"
                    field="lessonsLearned"
                    date={activeDate}
                    onSaved={handleFieldSaved}
                  />
                  <AutosaveTextarea
                    label="Tomorrow's Plan"
                    icon={<Sunrise size={14} />}
                    value={activeEntry?.tomorrowPlan ?? ''}
                    placeholder="Tomorrow, I will..."
                    field="tomorrowPlan"
                    date={activeDate}
                    onSaved={handleFieldSaved}
                  />
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

    </div>
  )
}

