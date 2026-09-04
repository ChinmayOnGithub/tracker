"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/lib/store/store'
import { fetchDashboardDataAction } from '@/app/actions/queries'

import {
  Trash2, CheckCircle2, CloudOff, Loader2, PlusCircle, Edit3,
  X, ArrowLeft, ChevronLeft, ChevronRight, MoreVertical, SortAsc, Upload
} from 'lucide-react'
import { Button, SearchInput, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, IconButton } from '@/design-system'
import { useSearchParams, useRouter } from 'next/navigation'

import { RichTextEditor } from '@/components/shared/RichTextEditor'
import { JournalContentAdapter } from '@/modules/journal/editor/JournalContentAdapter'
import { JournalExportService, ExportSummary } from '@/modules/journal/JournalExportService'
import { toYMD, todayYMD, fmtDateFull, fmtDateMed } from '@/lib/dateUtils'

interface JournalEntry {
  id: string
  journalDate: Date | string
  content: string
  mood: string | null
  gratitude: string | null
  reflections: string | null
  lessonsLearned: string | null
  tomorrowPlan: string | null
  metadata?: Record<string, unknown> | null
  createdAt: Date | string
  updatedAt: Date | string
}

interface JournalPanelProps {
  initialEntries: JournalEntry[]
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

export const JournalPanel: React.FC<JournalPanelProps> = ({ initialEntries }) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const dateParam = searchParams?.get('date')

  const today = todayYMD()
  const {
    state,
    initialize,
    upsertJournalAction,
    deleteJournalAction,
    saveJournalDraftAction,
    setActiveJournalDateAction,
    setJournalSearchQueryAction,
    setCacheMetadata,
  } = useStore()

  useEffect(() => {
    initialize({ journalEntries: initialEntries })
  }, [initialEntries, initialize])

  const entries = state.journalEntries.length > 0 ? state.journalEntries : initialEntries

  const [activeDate, setActiveDateState] = useState<string>(() => state.activeJournalDate || dateParam || today)
  const setActiveDate = (date: string) => {
    setActiveDateState(date)
    setActiveJournalDateAction(date)
  }

  const activeEntry = entries.find(e => toYMD(e.journalDate) === activeDate) || null
  const dbValue = JournalContentAdapter.toEditor(activeEntry?.content)
  const draftContent = state.journalDrafts[activeDate]?.content
  const editorValue = draftContent !== undefined ? draftContent : dbValue
  
  const [content, setContent] = useState(editorValue)
  const [contentStatus, setContentStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Adjust activeDate state synchronously during render if store updates
  const [prevActiveJournalDate, setPrevActiveJournalDate] = useState(state.activeJournalDate)
  if (state.activeJournalDate && state.activeJournalDate !== prevActiveJournalDate) {
    setPrevActiveJournalDate(state.activeJournalDate)
    setActiveDateState(state.activeJournalDate)
  }

  const JOURNAL_TTL = 60000 // 60 seconds TTL for Journal

  // Loop-safe state ref to prevent useEffect infinite trigger loops
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let active = true
    const lastFetched = stateRef.current.cacheMetadata.lastFetched['journal'] || 0
    const isValidating = stateRef.current.cacheMetadata.isValidating['journal']
    const entriesLength = stateRef.current.journalEntries.length
    const isStale = Date.now() - lastFetched > JOURNAL_TTL

    if (!isValidating && (isStale || entriesLength === 0)) {
      const revalidate = async () => {
        setCacheMetadata('journal', lastFetched, true)
        try {
          const res = await fetchDashboardDataAction(activeDate)
          if (active && res.success && res.data) {
            initialize({
              journalEntries: res.data.journalEntries,
            })
            setCacheMetadata('journal', Date.now(), false)
          } else if (active) {
            setCacheMetadata('journal', lastFetched, false)
          }
        } catch (err) {
          console.error('[JournalPanel] Background revalidation failed:', err)
          if (active) {
            setCacheMetadata('journal', lastFetched, false)
          }
        }
      }
      revalidate()
    }
    return () => {
      active = false
    }
  }, [activeDate, initialize, setCacheMetadata])

  const isSavingRef = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const pendingRevisionRef = useRef<number | null>(null)

  const [search, setSearchState] = useState(state.journalSearchQuery)
  const setSearch = (query: string) => {
    setSearchState(query)
    setJournalSearchQueryAction(query)
  }
  const [sort, setSort] = useState<'newest' | 'oldest' | 'longest' | 'shortest'>('newest')
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('editor')

  interface AttachedImage {
    name: string
    data: string
  }

  const getMetadataImages = (entry: JournalEntry | null): AttachedImage[] => {
    if (!entry || !entry.metadata) return []
    try {
      const meta = typeof entry.metadata === 'string' ? JSON.parse(entry.metadata) : entry.metadata
      if (Array.isArray(meta.images)) {
        return meta.images.map((item: unknown) => {
          if (typeof item === 'string') {
            return { name: `image.png`, data: item }
          }
          const obj = item as { name?: string; data?: string } | null
          return { name: obj?.name || `image.png`, data: obj?.data || '' }
        })
      }
      return []
    } catch {
      return []
    }
  }

  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>(getMetadataImages(activeEntry))
  const [mentionMenu, setMentionMenu] = useState<{ open: boolean; x: number; y: number; query?: string } | null>(null)

  // Adjust content state and other related values synchronously during render when date/dbValue changes
  const [prevDate, setPrevDate] = useState(activeDate)
  const [prevDbValue, setPrevDbValue] = useState(dbValue)
  if (activeDate !== prevDate || dbValue !== prevDbValue) {
    setPrevDate(activeDate)
    setPrevDbValue(dbValue)
    const draft = state.journalDrafts[activeDate]?.content
    setContent(draft !== undefined ? draft : dbValue)
    setAttachedImages(getMetadataImages(activeEntry))
    setMentionMenu(null)
    setContentStatus('idle')
  }
  const [zoomImage, setZoomImage] = useState<string | null>(null)

  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)

  // Monotonic revision counters to prevent stale saves from overwriting newer edits
  const revisionRef = useRef(0)
  const savedRevisionRef = useRef(0)

  // Refs to access the latest state inside the Tiptap transaction/event closures
  const attachedImagesRef = useRef(attachedImages)
  const mentionMenuRef = useRef(mentionMenu)

  useEffect(() => {
    attachedImagesRef.current = attachedImages
  }, [attachedImages])

  useEffect(() => {
    mentionMenuRef.current = mentionMenu
  }, [mentionMenu])

  // Dismiss mention menu on window clicks (click-away support)
  useEffect(() => {
    const handleOutsideClick = () => {
      setMentionMenu(null)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  // Save metadata changes
  const saveMetadata = async (imgs: AttachedImage[]) => {
    try {
      setContentStatus('saving')
      await upsertJournalAction(activeDate, { metadata: { images: imgs } })
      setContentStatus('saved')
    } catch (err) {
      console.error(err)
      setContentStatus('error')
    }
  }

  const triggerLocalContentChange = (html: string) => {
    setContent(html)
    setContentStatus('saving')
  }

  // Safe read-only exporter triggers
  const handleExportJournal = async () => {
    try {
      const { archive, summary } = await JournalExportService.exportArchive()
      setExportSummary(summary)
      setShowExportDialog(true)

      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tracker-journal-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Failed to export journal archive.')
    }
  }

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const saveContent = useCallback(async (v: string, saveRevision: number) => {
    if (isSavingRef.current) { 
      pendingRef.current = v
      pendingRevisionRef.current = saveRevision
      return 
    }
    isSavingRef.current = true
    setContentStatus('saving')
    try {
      await upsertJournalAction(activeDate, { content: v })
      if (saveRevision >= savedRevisionRef.current) {
        savedRevisionRef.current = saveRevision
      }
      if (savedRevisionRef.current === revisionRef.current) {
        setContentStatus('saved')
      }
    } catch (err) {
      console.error('[JournalPanel] Save error:', err)
      setContentStatus('error')
    } finally {
      isSavingRef.current = false
      if (pendingRef.current !== null && pendingRevisionRef.current !== null) {
        const next = pendingRef.current
        const nextVer = pendingRevisionRef.current
        pendingRef.current = null
        pendingRevisionRef.current = null
        saveContent(next, nextVer)
      }
    }
  }, [activeDate, upsertJournalAction])

  // Autosave triggers: runs automatically when content changes
  useEffect(() => {
    const dbVal = JournalContentAdapter.toEditor(activeEntry?.content)
    if (content === dbVal) return
    const currentRev = revisionRef.current
    const t = setTimeout(() => saveContent(content, currentRev), 1000)
    return () => clearTimeout(t)
  }, [content, activeEntry?.content, saveContent])

  const handleDelete = async (id: string, dateStr: string) => {
    if (confirm('Are you sure you want to delete this journal entry?')) {
      await deleteJournalAction(id)
      if (activeDate === dateStr) handleNavigateDate(today)
    }
  }

  const handleNavigateDate = (targetDateStr: string) => {
    // Flush any pending content for the previous date before switching
    if (content !== dbValue) {
      saveContent(content, revisionRef.current)
    }
    setActiveDate(targetDateStr)
    setMobileView('editor')
  }

  const navigateDay = (direction: 'prev' | 'next') => {
    const [y, m, d] = activeDate.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    date.setUTCDate(date.getUTCDate() + (direction === 'prev' ? -1 : 1))
    const yStr = date.getUTCFullYear()
    const mStr = String(date.getUTCMonth() + 1).padStart(2, '0')
    const dStr = String(date.getUTCDate()).padStart(2, '0')
    handleNavigateDate(`${yStr}-${mStr}-${dStr}`)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadImage = (file: File) => {
    // Client-side size validation (max 5MB per image)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image exceeds maximum recommended size (5MB). Please choose a smaller image.')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string

      setAttachedImages(prev => {
        if (prev.some(item => item.data === base64)) return prev
        const updated = [...prev, { name: file.name, data: base64 }]
        setTimeout(() => saveMetadata(updated), 0)
        return updated
      })
    }
    reader.readAsDataURL(file)
  }

  const deleteImageFromGallery = (src: string) => {
    const updated = attachedImages.filter(img => img.data !== src)
    setAttachedImages(updated)
    setTimeout(() => saveMetadata(updated), 0)
  }

  const insertExistingImage = (src: string, name?: string) => {
    const imgHtml = `<img src="${src}" alt="${name || 'image'}" style="max-height: 500px; object-fit: contain; display: block;" />`
    triggerLocalContentChange(content + imgHtml)
  }

  const insertFromMention = (src: string, name?: string) => {
    const imgHtml = `<img src="${src}" alt="${name || 'image'}" style="max-height: 500px; object-fit: contain; display: block;" />`
    triggerLocalContentChange(content + imgHtml)
    setMentionMenu(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => uploadImage(file))
    }
    e.target.value = ''
  }

  // Helper: count words in content (strips HTML tags)
  const wordCount = (html: string) => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return text ? text.split(' ').length : 0
  }

  const sortLabels: Record<string, string> = {
    newest: 'Newest first',
    oldest: 'Oldest first',
    longest: 'Longest',
    shortest: 'Shortest',
  }

  const filtered = entries
    .filter(e => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        (e.content || '').toLowerCase().includes(q) ||
        (e.mood || '').toLowerCase().includes(q) ||
        (e.reflections || '').toLowerCase().includes(q) ||
        (e.gratitude || '').toLowerCase().includes(q) ||
        (e.lessonsLearned || '').toLowerCase().includes(q) ||
        (e.tomorrowPlan || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sort === 'oldest') return new Date(a.journalDate).getTime() - new Date(b.journalDate).getTime()
      if (sort === 'longest') return wordCount(b.content || '') - wordCount(a.content || '')
      if (sort === 'shortest') return wordCount(a.content || '') - wordCount(b.content || '')
      // newest (default)
      return new Date(b.journalDate).getTime() - new Date(a.journalDate).getTime()
    })

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[70vh] bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-lg overflow-hidden shadow-xs">
      
      {/* ── LEFT SIDEBAR: History ── */}
      <aside className={`w-full md:w-72 md:shrink-0 flex flex-col bg-slate-50/50 dark:bg-zinc-900/40 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 ${mobileView === 'editor' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black tracking-tight text-[var(--color-text-main)]">Journal</h3>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => handleNavigateDate(today)}
                variant="ghost"
                size="sm"
                icon={<Edit3 className="w-4 h-4" strokeWidth={2.5} />}
                title="New Entry (Today)"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    icon={<MoreVertical className="w-4 h-4" />}
                    label="Journal Actions"
                    variant="ghost"
                    size="sm"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportJournal}>
                    Export All Entries
                  </DropdownMenuItem>
                  {activeEntry && (
                    <DropdownMenuItem 
                      onClick={() => handleDelete(activeEntry.id, activeDate)}
                      className="text-rose-500 hover:text-rose-600 dark:hover:text-rose-450"
                    >
                      Delete Current Entry
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search all entries..."
            onClear={() => setSearch('')}
          />

          {/* Sort control */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors px-2 py-1 rounded-md hover:bg-slate-200/50 dark:hover:bg-zinc-800/60"
                >
                  <SortAsc className="w-3 h-3" />
                  {sortLabels[sort]}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {(['newest', 'oldest', 'longest', 'shortest'] as const).map(opt => (
                  <DropdownMenuItem
                    key={opt}
                    onClick={() => setSort(opt)}
                    className={sort === opt ? 'font-bold text-[var(--color-primary)]' : ''}
                  >
                    {sortLabels[opt]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {search.trim() && (
              <span className="text-[10px] font-semibold text-[var(--color-text-muted)] ml-auto">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-4 px-2 space-y-0.5">
          {filtered.map(entry => {
            const dateStr = toYMD(entry.journalDate)
            const isActive = activeDate === dateStr
            const preview = JournalContentAdapter.toDatabase(entry.content).plainText || 'No text written.'
            const wc = wordCount(entry.content || '')
            const hasMood = !!entry.mood

            return (
              <div
                key={entry.id}
                onClick={() => handleNavigateDate(dateStr)}
                className={`group relative flex flex-col gap-1.5 px-3 py-3 rounded-lg cursor-pointer transition-all duration-150 border-l-4 ${
                  isActive
                    ? 'bg-[var(--color-accent)] border-l-[var(--color-primary)] shadow-xs'
                    : 'border-l-transparent text-[var(--color-text-main)] hover:bg-slate-200/50 dark:hover:bg-zinc-800/60 hover:translate-x-0.5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold flex items-center gap-1.5 text-[var(--color-text-main)]">
                    {hasMood && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--color-primary)]" />
                    )}
                    {fmtDateMed(entry.journalDate)}
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums shrink-0 text-[var(--color-text-muted)]">
                    {wc > 0 ? `${wc}w` : ''}
                  </span>
                </div>
                <p className="text-xs line-clamp-2 leading-relaxed text-[var(--color-text-muted)]">
                  {preview}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(entry.id, dateStr) }}
                  className="absolute right-2 bottom-2 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg transition-colors text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  title="Delete Entry"
                  aria-label="Delete Entry"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-[var(--color-text-muted)] py-8 font-medium">
              {search.trim() ? `No entries match "${search}"` : 'No entries yet.'}
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT WORKSPACE: Canvas ── */}
      <main className={`flex-1 flex flex-col xl:flex-row bg-[var(--color-bg-base)] relative overflow-hidden h-full min-h-0 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Editor Writing Area */}
        <div className="flex-1 flex flex-col overflow-y-auto px-4 sm:px-6 md:px-12 py-6 sm:py-8 pb-24 border-r border-[var(--color-border)]/50 h-full min-h-0">
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col gap-5 min-h-0">
            
            <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
              {dateParam ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/calendar?date=${activeDate}`)}
                  className="text-xs font-bold flex items-center gap-1.5"
                  icon={<ArrowLeft size={13} />}
                >
                  Back to Calendar
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileView('list')}
                  className="md:hidden text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-1.5"
                  icon={<ArrowLeft size={14} />}
                >
                  History
                </Button>
              )}
              
              {/* Date Navigation & Picker */}
              <div className="flex items-center gap-1 bg-[var(--color-bg-surface)] p-1 border border-[var(--color-border)] rounded-[var(--card-radius)] shadow-xs">
                <Button variant="ghost" size="icon-sm" onClick={() => navigateDay('prev')} icon={<ChevronLeft size={14} />} title="Previous Day" />
                <input
                  type="date"
                  value={activeDate}
                  onChange={e => handleNavigateDate(e.target.value)}
                  className="bg-transparent border-0 font-bold text-xs text-[var(--color-text-main)] w-32 text-center cursor-pointer focus:outline-hidden"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => navigateDay('next')} icon={<ChevronRight size={14} />} title="Next Day" />
              </div>

              {/* Status feedback */}
              <div className="flex items-center gap-2">
                <SyncStatus status={contentStatus} />
              </div>
            </div>

            <div className="border-b border-[var(--color-border)]/50 pb-3 shrink-0">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text-main)] tracking-tight">
                {fmtDateFull(activeDate + 'T12:00:00Z')}
              </h1>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              multiple
            />

            {/* Always-editable Rich Text Editor with slide-down toolbar on focus */}
            <div className="mt-2 flex-1 flex flex-col min-h-0">
              <RichTextEditor
                value={content}
                onChange={(html) => {
                  revisionRef.current += 1
                  triggerLocalContentChange(html)
                  saveJournalDraftAction(activeDate, { content: html })
                }}
                onImageUploadRequested={() => fileInputRef.current?.click()}
                minHeight="100%"
                className="flex-1 h-full min-h-0"
              />
            </div>

            {/* Mention Menu */}
            {mentionMenu && (
              <div 
                className="fixed z-50 bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-1.5 shadow-xl animate-fade-in w-64 max-h-48 overflow-y-auto space-y-0.5"
                style={{
                  top: `${mentionMenu.y}px`,
                  left: `${mentionMenu.x}px`,
                }}
              >
                {attachedImages.filter(img => 
                  !mentionMenu.query || img.name.toLowerCase().includes(mentionMenu.query.toLowerCase())
                ).length > 0 ? (
                  <div className="flex flex-col">
                    {attachedImages.filter(img => 
                      !mentionMenu.query || img.name.toLowerCase().includes(mentionMenu.query.toLowerCase())
                    ).map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); insertFromMention(img.data, img.name) }}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-main)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.data} alt={img.name} className="w-5 h-5 rounded-md object-cover border border-[var(--color-border)]" />
                        <span className="truncate flex-1">{img.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--color-text-muted)] font-bold p-2 leading-normal">No matching memories.</p>
                )}
              </div>
            )}

            {/* Memories Section (Mobile & Tablet Layout) */}
            {attachedImages.length > 0 && (
              <div className="xl:hidden mt-6 pt-6 border-t border-[var(--color-border)]/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Memories</h3>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
                  >
                    <Upload size={11} /> Attach
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {attachedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="group relative aspect-square rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-border)] shadow-3xs"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.data}
                        alt={img.name}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setZoomImage(img.data)}
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 py-1 px-2 flex items-center justify-around sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => insertExistingImage(img.data, img.name)}
                          className="text-white hover:text-blue-400 p-1 cursor-pointer"
                          title="Insert into text"
                          aria-label="Insert into text"
                        >
                          <PlusCircle size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteImageFromGallery(img.data)}
                          className="text-white hover:text-rose-500 p-1 cursor-pointer"
                          title="Delete from memories"
                          aria-label="Delete from memories"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Memories Gallery Panel (Desktop Sidebar Layout) */}
        <aside className="w-64 shrink-0 bg-[var(--color-bg-subtle)]/30 p-5 overflow-y-auto hidden xl:block border-l border-[var(--color-border)]/50">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Memories</h3>
                <p className="text-[10px] text-[var(--color-text-muted)] font-medium mt-0.5">Photos in this entry</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] hover:opacity-80 transition-opacity cursor-pointer"
              >
                <Upload size={11} /> Add
              </button>
            </div>

            {attachedImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {attachedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="group relative aspect-square rounded-[var(--radius-md)] overflow-hidden border border-[var(--color-border)] shadow-3xs hover:border-[var(--color-primary)] transition-all bg-[var(--color-bg-surface)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.data}
                      alt={img.name}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setZoomImage(img.data)}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/75 py-1.5 px-2 flex items-center justify-around sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => insertExistingImage(img.data, img.name)}
                        className="text-white hover:text-blue-400 p-1 cursor-pointer"
                        title="Insert into text"
                        aria-label="Insert into text"
                      >
                        <PlusCircle size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteImageFromGallery(img.data)}
                        className="text-white hover:text-rose-500 p-1 cursor-pointer"
                        title="Delete from memories"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-10 border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-md)] text-[11px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors flex flex-col items-center gap-2 cursor-pointer"
              >
                <Upload size={16} />
                Attach a photo
              </button>
            )}
          </div>
        </aside>

        {/* Lightbox Zoom Modal */}
        {zoomImage && (
          <div 
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
            onClick={() => setZoomImage(null)}
          >
            <button 
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={zoomImage} 
              alt="Zoomed Memory" 
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" 
            />
          </div>
        )}
      </main>

      {/* Export Complete Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Journal Export Complete</DialogTitle>
            <DialogDescription>
              Your personal journal backup has been successfully generated and downloaded.
            </DialogDescription>
          </DialogHeader>
          <div className="p-5 space-y-3 text-sm text-[var(--color-text-main)]">
            <div className="flex justify-between border-b border-[var(--color-border)]/40 pb-1.5">
              <span>Entries Exported:</span>
              <span className="font-bold">{exportSummary?.entriesCount}</span>
            </div>
            <div className="flex justify-between border-b border-[var(--color-border)]/40 pb-1.5">
              <span>Conflicts Resolved:</span>
              <span className="font-bold">{exportSummary?.conflictsCount}</span>
            </div>
            <div className="flex justify-between border-b border-[var(--color-border)]/40 pb-1.5">
              <span>Warnings:</span>
              <span className={`font-bold ${exportSummary && exportSummary.warningsCount > 0 ? 'text-amber-500' : ''}`}>
                {exportSummary?.warningsCount}
              </span>
            </div>
            {exportSummary && exportSummary.warnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg text-xs text-amber-600 max-h-24 overflow-y-auto">
                {exportSummary.warnings.map((w, idx) => <div key={idx}>{w}</div>)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="primary" onClick={() => setShowExportDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
