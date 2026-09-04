"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/lib/store/store'
import { Note } from '@/types'
import { RichTextEditor } from '@/components/shared/RichTextEditor'
import {
  Plus, Trash2, ArrowLeft, MoreVertical,
  CheckCircle2, Loader2, CloudOff, FileText, Clock
} from 'lucide-react'
import {
  Button, SearchInput, DropdownMenu, DropdownMenuTrigger,
  DropdownMenuContent, DropdownMenuItem, IconButton
} from '@/design-system'

function fmtRelativeTime(dateInput: Date | string) {
  try {
    const d = new Date(dateInput)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / (60 * 1000))
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

interface NotesPanelProps {
  initialNotes?: Note[]
}

export const NotesPanel: React.FC<NotesPanelProps> = ({ initialNotes = [] }) => {
  const { state, initialize, upsertNoteAction, deleteNoteAction } = useStore()

  useEffect(() => {
    if (initialNotes.length > 0) {
      initialize({ notes: initialNotes })
    }
  }, [initialNotes, initialize])

  const notes = state.notes.length > 0 ? state.notes : initialNotes

  const [rawSelectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const selectedNoteId = rawSelectedNoteId || (notes.length > 0 ? notes[0].id : null)

  const [search, setSearch] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const activeNote = notes.find(n => n.id === selectedNoteId) || null

  const [title, setTitle] = useState(activeNote?.title || '')
  const [content, setContent] = useState(activeNote?.content || '')

  // Adjust active note state when selected note changes
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(selectedNoteId)
  if (selectedNoteId !== prevSelectedId) {
    setPrevSelectedId(selectedNoteId)
    setTitle(activeNote?.title || '')
    setContent(activeNote?.content || '')
    setSaveStatus('idle')
  }

  const isSavingRef = useRef(false)
  const pendingSaveRef = useRef<{ title: string; content: string } | null>(null)

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const performSave = useCallback(async (nId: string, nTitle: string, nContent: string) => {
    if (isSavingRef.current) {
      pendingSaveRef.current = { title: nTitle, content: nContent }
      return
    }
    isSavingRef.current = true
    setSaveStatus('saving')
    try {
      await upsertNoteAction('', nContent, nTitle || null, nId)
      setSaveStatus('saved')
    } catch (err) {
      console.error('[NotesPanel] Save error:', err)
      setSaveStatus('error')
    } finally {
      isSavingRef.current = false
      if (pendingSaveRef.current) {
        const next = pendingSaveRef.current
        pendingSaveRef.current = null
        void performSave(nId, next.title, next.content)
      }
    }
  }, [upsertNoteAction])

  // Autosave when title or content change
  useEffect(() => {
    if (!activeNote) return
    const isTitleChanged = title !== (activeNote.title || '')
    const isContentChanged = content !== (activeNote.content || '')

    if (!isTitleChanged && !isContentChanged) return

    const t = setTimeout(() => {
      void performSave(activeNote.id, title, content)
    }, 800)

    return () => clearTimeout(t)
  }, [title, content, activeNote, performSave])

  const handleCreateNote = async () => {
    const tempId = `note-${Date.now()}`
    const newNote: Note = {
      id: tempId,
      title: '',
      content: '',
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setSelectedNoteId(tempId)
    setTitle('')
    setContent('')
    setMobileView('editor')
    await upsertNoteAction(newNote.date, '', null, tempId)
  }

  const handleDeleteNote = async (id: string) => {
    if (confirm('Are you sure you want to delete this note?')) {
      await deleteNoteAction(id)
      const remaining = notes.filter(n => n.id !== id)
      if (remaining.length > 0) {
        setSelectedNoteId(remaining[0].id)
      } else {
        setSelectedNoteId(null)
      }
      setMobileView('list')
    }
  }

  const filteredNotes = notes.filter(n => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[75vh] bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--card-radius)] overflow-hidden shadow-xs">
      {/* ── LEFT SIDEBAR: Notes List ── */}
      <aside className={`w-full md:w-80 md:shrink-0 flex flex-col bg-[var(--color-bg-subtle)] border-b md:border-b-0 md:border-r border-[var(--color-border)] ${mobileView === 'editor' ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[var(--color-primary)]" />
              <h3 className="text-base font-extrabold tracking-tight text-[var(--color-text-main)]">Notes</h3>
            </div>
            <Button
              onClick={handleCreateNote}
              size="sm"
              icon={<Plus className="w-4 h-4" strokeWidth={2.5} />}
              className="text-xs font-bold"
            >
              New note
            </Button>
          </div>

          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search notes..."
            onClear={() => setSearch('')}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {filteredNotes.map(n => {
            const isSelected = n.id === selectedNoteId
            const snippet = stripHtml(n.content) || 'No text'
            const displayTitle = n.title?.trim() || snippet.slice(0, 30) || 'Untitled Note'

            return (
              <div
                key={n.id}
                onClick={() => {
                  setSelectedNoteId(n.id)
                  setMobileView('editor')
                }}
                className={`group relative flex flex-col gap-1 p-3 rounded-[var(--radius-md)] cursor-pointer transition-all duration-150 border-l-4 ${
                  isSelected
                    ? 'bg-[var(--color-accent)] border-l-[var(--color-primary)] shadow-xs'
                    : 'border-l-transparent text-[var(--color-text-main)] hover:bg-[var(--color-accent)]/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--color-text-main)] truncate max-w-[190px]">
                    {displayTitle}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-medium shrink-0 flex items-center gap-1">
                    <Clock size={10} />
                    {fmtRelativeTime(n.updatedAt)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                  {snippet}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteNote(n.id)
                  }}
                  className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-rose-500 rounded transition-opacity"
                  title="Delete Note"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}

          {filteredNotes.length === 0 && (
            <div className="text-center py-12 px-4 text-xs text-[var(--color-text-muted)]">
              {search.trim() ? `No notes match "${search}"` : 'No notes yet. Create your first note!'}
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT WORKSPACE: Note Canvas ── */}
      <main className={`flex-1 flex flex-col bg-[var(--color-bg-base)] relative overflow-hidden ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
        {activeNote ? (
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 py-6 sm:py-8 pb-24">
            <div className="max-w-4xl mx-auto w-full flex flex-col gap-4">
              
              {/* Top Navigation & Status */}
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)]/40 pb-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileView('list')}
                  className="md:hidden text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-1.5"
                  icon={<ArrowLeft size={14} />}
                >
                  Notes
                </Button>

                <div className="flex items-center gap-2 ml-auto">
                  {saveStatus === 'saving' && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                      <Loader2 size={11} className="animate-spin" /> Saving...
                    </span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                      <CheckCircle2 size={11} /> Saved
                    </span>
                  )}
                  {saveStatus === 'error' && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-rose-500">
                      <CloudOff size={11} /> Offline
                    </span>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        icon={<MoreVertical size={14} />}
                        label="Note Options"
                        variant="ghost"
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleDeleteNote(activeNote.id)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Note
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Editable Title Input */}
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Untitled Note"
                className="w-full bg-transparent text-2xl sm:text-3xl font-black text-[var(--color-text-main)] placeholder-[var(--color-text-muted)]/50 focus:outline-hidden tracking-tight border-0 p-0"
              />

              {/* Always-editable Rich Text Editor */}
              <div className="mt-2">
                <RichTextEditor
                  value={content}
                  onChange={(html) => setContent(html)}
                  placeholder="Start typing your note..."
                  minHeight="450px"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
              <FileText size={24} />
            </div>
            <h4 className="text-sm font-bold text-[var(--color-text-main)]">No note selected</h4>
            <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
              Select a note from the sidebar or create a new note to start capturing your thoughts.
            </p>
            <Button onClick={handleCreateNote} size="sm" icon={<Plus size={14} />}>
              Create Note
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
