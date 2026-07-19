"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { upsertJournalEntry, deleteJournalEntry } from '@/app/actions/journal'
import {
  Trash2, Search, CheckCircle2, CloudOff, Loader2, Edit3, PlusCircle,
  Bold, Italic, Underline, Code, List, Heading1, Heading2, Highlighter, Quote, Undo2, Redo2, Eraser, Image as ImageIcon, X
} from 'lucide-react'
import { Button, SearchInput, EmptyState, Card, Input } from '@/design-system'


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
function markdownToHtml(text: string): string {
  if (!text) return ''
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text
  }
  let html = text
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/_([^_]+)_/g, '<i>$1</i>')
    .replace(/==([^=]+)==/g, '<mark style="background-color: #fef08a; color: #000000;">$1</mark>')
    .replace(/~~([^~]+)~~/g, '<strike>$1</strike>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^-\s+(.+)$/gm, '<ul><li>$1</li></ul>')
  
  html = html.replace(/<\/ul>\s*<ul>/g, '')
  html = html.replace(/\n/g, '<br>')
  return html
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


interface JournalPanelProps {
  initialEntries: JournalEntry[]
}

export const JournalPanel: React.FC<JournalPanelProps> = ({ initialEntries }) => {
  console.log('[JournalPanel] Initialized with entries:', initialEntries.length)
  initialEntries.forEach(e => {
    console.log(`  - ${e.id}: ${e.journalDate}, content length: ${e.content.length}`)
  })
  
  const today = todayYMD()
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries)
  const [activeDate, setActiveDate] = useState<string>(today)
  const [search, setSearch] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('editor')
  // Editor states for active date
  const activeEntry = entries.find(e => toYMD(e.journalDate) === activeDate) || null
  
  console.log('[JournalPanel] Active date:', activeDate, 'Active entry:', activeEntry ? `${activeEntry.id} (${activeEntry.content.length} chars)` : 'null')
  
  const [content, setContent] = useState(markdownToHtml(activeEntry?.content || ''))
  const [contentStatus, setContentStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const isSavingRef = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  const execCmd = (cmd: string, val: string = '') => {
    // If it's a block formatting command, check if we should toggle it off
    if (cmd === 'formatBlock' && typeof window !== 'undefined') {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        let parentNode: Node | null = range.commonAncestorContainer
        
        let activeBlockTag: string | null = null
        while (parentNode && parentNode !== editorRef.current) {
          if (parentNode.nodeType === Node.ELEMENT_NODE) {
            const tagName = (parentNode as Element).tagName.toLowerCase()
            if (['h1', 'h2', 'blockquote', 'pre'].includes(tagName)) {
              activeBlockTag = tagName
              break
            }
          }
          parentNode = parentNode.parentNode
        }

        const targetTag = val.replace(/[<>]/g, '').toLowerCase()
        if (activeBlockTag === targetTag) {
          // If already inside the target block, toggle back to normal paragraph block
          document.execCommand('formatBlock', false, '<p>')
          if (editorRef.current) {
            const html = editorRef.current.innerHTML
            setContent(html)
            setContentStatus('saving')
          }
          return
        }
      }
    }

    // Standardize background highlight commands for cross-browser support
    const command = cmd === 'hiliteColor' && typeof window !== 'undefined' && !/Chrome|Safari/.test(navigator.userAgent) 
      ? 'backColor' 
      : cmd
    document.execCommand(command, false, val)
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      setContent(html)
      setContentStatus('saving')
    }
  }

  const clearFormatting = () => {
    if (typeof window === 'undefined') return
    document.execCommand('removeFormat')
    document.execCommand('formatBlock', false, '<p>')
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      setContent(html)
      setContentStatus('saving')
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

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
          const obj = item as { name?: string; data?: string }
          return { name: obj?.name || `image.png`, data: obj?.data || '' }
        })
      }
      return []
    } catch {
      return []
    }
  }

  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>(getMetadataImages(activeEntry))
  const [mentionMenu, setMentionMenu] = useState<{ open: boolean; x: number; y: number } | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)

  const saveMetadata = async (imgs: AttachedImage[]) => {
    try {
      setContentStatus('saving')
      const res = await upsertJournalEntry(activeDate, { metadata: { images: imgs } })
      if (res.success && res.entry) {
        setContentStatus('saved')
        setEntries(prev => {
          const idx = prev.findIndex(e => toYMD(e.journalDate) === activeDate)
          if (idx >= 0) {
            const copy = [...prev]
            copy[idx] = { ...copy[idx], metadata: { images: imgs }, id: res.entry.id }
            return copy
          }
          return prev
        })
      } else {
        setContentStatus('error')
      }
    } catch {
      setContentStatus('error')
    }
  }

  const insertImageHTML = (src: string, name?: string) => {
    if (editorRef.current) {
      editorRef.current.focus()
      const imgName = name || `Image ${attachedImages.length + 1}`
      const imgHtml = `<img src="${src}" alt="${imgName}" class="max-w-full my-4 rounded-lg border border-slate-200 dark:border-zinc-800 shadow-sm transition-transform hover:scale-[1.01]" style="max-height: 380px; object-fit: contain; display: block;" />`
      document.execCommand('insertHTML', false, imgHtml)
      
      const html = editorRef.current.innerHTML
      setContent(html)
      setContentStatus('saving')

      setAttachedImages(prev => {
        if (prev.some(item => item.data === src)) return prev
        const updated = [...prev, { name: imgName, data: src }]
        saveMetadata(updated)
        return updated
      })
    }
  }

  const deleteImageFromGallery = (src: string) => {
    const updated = attachedImages.filter(img => img.data !== src)
    setAttachedImages(updated)
    saveMetadata(updated)
  }

  const insertExistingImage = (src: string, name?: string) => {
    insertImageHTML(src, name)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            const base64 = event.target?.result as string
            const name = file.name || `Pasted image - ${new Date().toLocaleTimeString()}.png`
            insertImageHTML(base64, name)
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = files[i]
          const reader = new FileReader()
          reader.onload = (event) => {
            const base64 = event.target?.result as string
            insertImageHTML(base64, file.name)
          }
          reader.readAsDataURL(file)
        }
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onload = (event) => {
          const base64 = event.target?.result as string
          insertImageHTML(base64, file.name)
        }
        reader.readAsDataURL(file)
      })
    }
    e.target.value = ''
  }

  const handleKeyUp = (_e: React.KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const textContent = range.startContainer.textContent || ''
      const offset = range.startOffset
      
      const char = textContent.slice(offset - 1, offset)
      if (char === '@') {
        savedRangeRef.current = range.cloneRange()
        const rect = range.getBoundingClientRect()
        setMentionMenu({
          open: true,
          x: rect.left,
          y: rect.bottom + 8
        })
        setActiveMentionIndex(0)
      } else if (!textContent.includes('@')) {
        setMentionMenu(null)
        savedRangeRef.current = null
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mentionMenu && mentionMenu.open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveMentionIndex(prev => (prev + 1) % attachedImages.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveMentionIndex(prev => (prev - 1 + attachedImages.length) % attachedImages.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (attachedImages[activeMentionIndex]) {
          insertFromMention(attachedImages[activeMentionIndex].data, attachedImages[activeMentionIndex].name)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setMentionMenu(null)
      }
    }
  }

  const insertFromMention = (src: string, name?: string) => {
    setMentionMenu(null)
    const selection = window.getSelection()
    if (selection && savedRangeRef.current) {
      selection.removeAllRanges()
      selection.addRange(savedRangeRef.current)
      
      const range = savedRangeRef.current
      const node = range.startContainer
      const offset = range.startOffset
      
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''
        if (text.slice(offset - 1, offset) === '@') {
          node.textContent = text.slice(0, offset - 1) + text.slice(offset)
          range.setStart(node, offset - 1)
          range.setEnd(node, offset - 1)
        }
      }
      
      if (editorRef.current) {
        editorRef.current.focus()
      }
      
      insertImageHTML(src, name)
      savedRangeRef.current = null
    }
  }

  const [zoomImage, setZoomImage] = useState<string | null>(null)

  // Sync editor innerHTML when switching journal entry dates
  useEffect(() => {
    if (editorRef.current) {
      const dbValue = markdownToHtml(activeEntry?.content || '')
      if (editorRef.current.innerHTML !== dbValue) {
        editorRef.current.innerHTML = dbValue
      }
    }
  }, [activeDate, activeEntry?.content])

  const [prevActiveDate, setPrevActiveDate] = useState(activeDate)
  const [prevActiveEntryId, setPrevActiveEntryId] = useState(activeEntry?.id)

  if (activeDate !== prevActiveDate || activeEntry?.id !== prevActiveEntryId) {
    setContent(markdownToHtml(activeEntry?.content || ''))
    setAttachedImages(getMetadataImages(activeEntry))
    setMentionMenu(null)
    setContentStatus('idle')
    setPrevActiveDate(activeDate)
    setPrevActiveEntryId(activeEntry?.id)
  }

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const saveContent = useCallback(async (v: string) => {
    console.log('[JournalPanel] saveContent called with:', { 
      length: v.length, 
      preview: v.substring(0, 100),
      activeDate 
    })
    
    if (isSavingRef.current) { pendingRef.current = v; return }
    isSavingRef.current = true
    setContentStatus('saving')
    try {
      const res = await upsertJournalEntry(activeDate, { content: v })
      console.log('[JournalPanel] Save response:', { 
        success: res.success, 
        entryId: res.entry?.id,
        savedContentLength: res.entry?.content.length 
      })
      
      if (res.success && res.entry) {
        setContentStatus('saved')
        setEntries(prev => {
          const idx = prev.findIndex(e => toYMD(e.journalDate) === activeDate)
          if (idx >= 0) {
            const copy = [...prev]
            copy[idx] = { ...copy[idx], content: v, id: res.entry.id }
            console.log('[JournalPanel] Updated existing entry in state:', copy[idx].id)
            return copy
          }
          const newEntry = {
            id: res.entry.id,
            journalDate: activeDate + 'T12:00:00Z',
            content: v, mood: null, gratitude: null, reflections: null, lessonsLearned: null, tomorrowPlan: null,
            createdAt: new Date(), updatedAt: new Date(),
            metadata: null
          }
          console.log('[JournalPanel] Created new entry in state:', newEntry.id)
          return [newEntry, ...prev]
        })
      } else {
        console.error('[JournalPanel] Save failed:', res.error)
        setContentStatus('error')
      }
    } catch (err) {
      console.error('[JournalPanel] Save error:', err)
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
    <div className="flex flex-col md:flex-row h-full min-h-[70vh] bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-lg overflow-hidden shadow-xs">
      
      {/* ── LEFT SIDEBAR: History ── */}
      <aside className={`w-full md:w-72 md:shrink-0 flex flex-col bg-slate-50/50 dark:bg-zinc-900/40 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 ${mobileView === 'editor' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black tracking-tight text-[var(--color-text-main)]">Journal</h3>
            <Button
              onClick={() => setActiveDate(today)}
              variant="ghost"
              size="sm"
              icon={<Edit3 className="w-4 h-4" strokeWidth={2.5} />}
              title="New Entry (Today)"
            />
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search journal..."
            onClear={() => setSearch('')}
          />
        </div>

        <div className="flex-1 overflow-y-auto pb-4 px-2 space-y-0.5">
          {filtered.map(entry => {
            const dateStr = toYMD(entry.journalDate)
            const isActive = activeDate === dateStr
            const cleanPreview = (entry.content || '')
              .replace(/<[^>]*>/g, '')
              .replace(/\*\*([^*]+)\*\*/g, '$1')
              .replace(/\*([^*]+)\*/g, '$1')
              .replace(/_([^_]+)_/g, '$1')
              .replace(/==([^=]+)==/g, '$1')
              .replace(/&nbsp;/g, ' ')
              .trim()
            const preview = cleanPreview || 'No text written.'

            return (
              <div
                key={entry.id}
                onClick={() => { setActiveDate(dateStr); setMobileView('editor') }}
                className={`group relative flex flex-col gap-1 px-3 py-3 rounded-lg cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-main)] hover:bg-slate-200/50 dark:hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[13px] font-bold ${isActive ? 'text-white' : 'text-[var(--color-text-main)]'}`}>
                    {shortDate(entry.journalDate)}
                  </span>
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
      <main className={`flex-1 flex flex-col xl:flex-row bg-white dark:bg-[#09090b] relative overflow-hidden ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {/* Editor Writing Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-12 py-6 sm:py-10 pb-24 border-r border-slate-100 dark:border-zinc-900/60">
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Back to list"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <h1 className="text-xl sm:text-3xl font-black text-[var(--color-text-main)] tracking-tight">
                  {formatJournalDate(activeDate + 'T12:00:00Z')}
                </h1>
              </div>
              <SyncStatus status={contentStatus} />
            </div>

            {/* Rich Formatting Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-50 dark:bg-zinc-900/50 border border-slate-205/65 dark:border-zinc-800/80 rounded-lg max-w-max">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('undo') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('redo') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 size={13} />
              </button>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('bold') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Bold (Ctrl+B)"
              >
                <Bold size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('italic') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Italic (Ctrl+I)"
              >
                <Italic size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('underline') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Underline (Ctrl+U)"
              >
                <Underline size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('hiliteColor', '#fef08a') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Highlight text"
              >
                <Highlighter size={13} />
              </button>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<h1>') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Heading 1"
              >
                <Heading1 size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<h2>') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Heading 2"
              >
                <Heading2 size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Bullet List"
              >
                <List size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<blockquote>') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Blockquote"
              >
                <Quote size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<pre>') }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Code Block"
              >
                <Code size={13} />
              </button>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click() }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Attach Image"
              >
                <ImageIcon size={13} />
              </button>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); clearFormatting() }}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                title="Clear all formatting"
              >
                <Eraser size={13} />
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              multiple
            />

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={e => {
                const html = e.currentTarget.innerHTML
                setContent(html)
                setContentStatus('saving')
              }}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onKeyUp={handleKeyUp}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              {...{ placeholder: "Start writing what you are thinking..." }}
              className="w-full mt-4 bg-transparent text-[17px] text-[var(--color-text-main)] placeholder-slate-350 dark:placeholder-zinc-700 focus:outline-hidden leading-[1.85] resize-none font-serif min-h-[350px] border-0 p-0 outline-hidden contenteditable-editor"
              style={{ minHeight: '350px' }}
            />

            {/* Mention Menu / Image Insert Popover (Fixed positioning right below caret) */}
            {mentionMenu && (
              <div 
                className="fixed z-50 bg-white dark:bg-zinc-900 border border-slate-205/65 dark:border-zinc-800 rounded-lg p-1.5 shadow-xl animate-fade-in w-64 max-h-48 overflow-y-auto space-y-0.5"
                style={{
                  top: `${mentionMenu.y}px`,
                  left: `${mentionMenu.x}px`,
                }}
              >
                {attachedImages.length > 0 ? (
                  <div className="flex flex-col">
                    {attachedImages.map((img, idx) => {
                      const isActive = idx === activeMentionIndex
                      return (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={e => { e.preventDefault(); insertFromMention(img.data, img.name) }}
                          className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isActive 
                              ? 'bg-blue-500 text-white dark:bg-blue-600' 
                              : 'text-slate-700 dark:text-zinc-350 hover:bg-slate-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.data} alt={img.name} className="w-5 h-5 rounded-md object-cover border border-slate-200 dark:border-zinc-705" />
                          <span className="truncate flex-1">{img.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-450 dark:text-zinc-500 font-bold p-2 leading-normal">No memories available. Paste or drag a photo into the editor first to add it to your memories list.</p>
                )}
              </div>
            )}

            {/* Memories Section (Mobile & Tablet Layout) */}
            <div className="xl:hidden mt-8 pt-8 border-t border-slate-100 dark:border-zinc-900/60">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Memories</h3>
              {attachedImages.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {attachedImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-800/80 shadow-3xs"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.data}
                        alt={img.name}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setZoomImage(img.data)}
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/70 py-1 px-2 flex items-center justify-around opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => insertExistingImage(img.data, img.name)}
                          className="text-white hover:text-blue-400 p-1 cursor-pointer"
                          title="Insert into text"
                        >
                          <PlusCircle size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteImageFromGallery(img.data)}
                          className="text-white hover:text-rose-500 p-1 cursor-pointer"
                          title="Delete from memories"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] font-semibold text-slate-400 dark:text-zinc-500">No images attached to this entry.</p>
              )}
            </div>

          </div>
        </div>

        {/* Memories Gallery Panel (Desktop Sidebar Layout) */}
        <aside className="w-85 shrink-0 bg-slate-50/15 dark:bg-zinc-950/10 p-6 overflow-y-auto hidden xl:block">
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Memories</h3>
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold mt-1">Images in this entry</p>
            </div>

            {attachedImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {attachedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-800/80 shadow-3xs hover:border-[var(--color-primary)] transition-all bg-slate-100 dark:bg-zinc-900"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.data}
                      alt={img.name}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setZoomImage(img.data)}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/75 py-1.5 px-2 flex items-center justify-around opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => insertExistingImage(img.data, img.name)}
                        className="text-white hover:text-blue-400 p-1 cursor-pointer"
                        title="Insert into text"
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
              <div className="text-center py-12 px-4 rounded-lg border-2 border-dashed border-slate-200 dark:border-zinc-800/80">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-zinc-500">No images attached. Paste, drop, or select photos to save memories.</span>
              </div>
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

    </div>
  )
}

