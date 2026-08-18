"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/lib/store/store'

import {
  Trash2, CheckCircle2, CloudOff, Loader2, Edit3, PlusCircle,
  Bold, Italic, Underline, Code, List, Heading1, Heading2, Highlighter, Quote, Undo2, Redo2, Eraser, Image as ImageIcon, X, ArrowLeft,
  ChevronLeft, ChevronRight, MoreVertical, Table as TableIcon, SortAsc, Upload
} from 'lucide-react'
import { Button, SearchInput, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, IconButton } from '@/design-system'
import { useSearchParams, useRouter } from 'next/navigation'

import { useEditor, EditorContent } from '@tiptap/react'
import { type Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExtension from '@tiptap/extension-underline'
import HighlightExtension from '@tiptap/extension-highlight'
import LinkExtension from '@tiptap/extension-link'
import ImageExtension from '@tiptap/extension-image'
import TaskListExtension from '@tiptap/extension-task-list'
import TaskItemExtension from '@tiptap/extension-task-item'
import { Table as TiptapTable } from '@tiptap/extension-table'
import { TableRow as TiptapTableRow } from '@tiptap/extension-table-row'
import { TableHeader as TiptapTableHeader } from '@tiptap/extension-table-header'
import { TableCell as TiptapTableCell } from '@tiptap/extension-table-cell'

import { JournalContentAdapter } from '@/modules/journal/editor/JournalContentAdapter'
import { JournalExportService, ExportSummary } from '@/modules/journal/JournalExportService'
import { toYMD, todayYMD, fmtDateFull, fmtDateMed } from '@/lib/dateUtils'

const CustomImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: attributes => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}; max-height: 500px; object-fit: contain; display: block;`
          }
        }
      }
    }
  }
})

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
  const { state, initialize, upsertJournalAction, deleteJournalAction } = useStore()

  useEffect(() => {
    initialize({ journalEntries: initialEntries })
  }, [initialEntries, initialize])

  const entries = state.journalEntries.length > 0 ? state.journalEntries : initialEntries
  const [activeDate, setActiveDate] = useState<string>(() => dateParam || today)
  const [editMode, setEditMode] = useState(false)

  const activeEntry = entries.find(e => toYMD(e.journalDate) === activeDate) || null
  const dbValue = JournalContentAdapter.toEditor(activeEntry?.content)
  
  const [content, setContent] = useState(dbValue)
  const [contentStatus, setContentStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const isSavingRef = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const pendingRevisionRef = useRef<number | null>(null)

  const [search, setSearch] = useState('')
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
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [selectedImageNode, setSelectedImageNode] = useState<{ element: HTMLImageElement; pos: number } | null>(null)

  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)

  // Monotonic revision counters to prevent stale saves from overwriting newer edits
  const revisionRef = useRef(0)
  const savedRevisionRef = useRef(0)

  const loadedDateRef = useRef<string | null>(null)
  const loadedEntryIdRef = useRef<string | null>(null)

  // Refs to access the latest state inside the Tiptap transaction/event closures
  const attachedImagesRef = useRef(attachedImages)
  const activeMentionIndexRef = useRef(activeMentionIndex)
  const mentionMenuRef = useRef(mentionMenu)

  useEffect(() => {
    attachedImagesRef.current = attachedImages
  }, [attachedImages])

  useEffect(() => {
    activeMentionIndexRef.current = activeMentionIndex
  }, [activeMentionIndex])

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

  // Helper to dynamically open and filter mention options based on what is typed after @
  const updateMentionMenu = useCallback((currentEditor: Editor) => {
    if (!currentEditor) return
    const { selection } = currentEditor.state
    const $from = selection.$from
    const textBefore = $from.parent.textBetween(
      Math.max(0, $from.parentOffset - 50),
      $from.parentOffset,
      undefined,
      ' '
    )
    const match = textBefore.match(/@([^\s]*)$/)
    if (match) {
      const query = match[1]
      const filteredImgs = attachedImagesRef.current.filter(img =>
        img.name.toLowerCase().includes(query.toLowerCase())
      )
      if (filteredImgs.length > 0) {
        try {
          const coords = currentEditor.view.coordsAtPos(selection.from)
          setMentionMenu({
            open: true,
            x: coords.left,
            y: coords.bottom + 8,
            query
          })
        } catch {
          setMentionMenu(prev => prev ? { ...prev, query } : null)
        }
      } else {
        setMentionMenu(null)
      }
    } else {
      setMentionMenu(null)
    }
  }, [])

  const resizeSelectedImage = (width: string) => {
    if (!selectedImageNode || !editor) return
    editor.commands.focus()
    editor.commands.command(({ tr }) => {
      const node = tr.doc.nodeAt(selectedImageNode.pos)
      if (node && node.type.name === 'image') {
        tr.setNodeMarkup(selectedImageNode.pos, undefined, {
          ...node.attrs,
          width
        })
      }
      return true
    })
    setSelectedImageNode(null)
  }

  // Tiptap Editor Initialization
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      UnderlineExtension,
      HighlightExtension.configure({ multicolor: true }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-[var(--color-primary)] hover:underline cursor-pointer',
        },
      }),
      CustomImage.configure({
        HTMLAttributes: {
          class: 'my-4 rounded-lg border border-slate-200 dark:border-zinc-800 shadow-sm transition-transform hover:scale-[1.01]',
          style: 'max-height: 500px; object-fit: contain; display: block;',
        },
      }),
      TaskListExtension,
      TaskItemExtension.configure({
        nested: true,
      }),
      TiptapTable.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse border border-slate-300 dark:border-zinc-750 my-4 w-full text-sm',
        },
      }),
      TiptapTableRow.configure({
        HTMLAttributes: {
          class: 'border-b border-slate-200 dark:border-zinc-850',
        },
      }),
      TiptapTableHeader.configure({
        HTMLAttributes: {
          class: 'border border-slate-300 dark:border-zinc-750 bg-slate-50 dark:bg-zinc-900/50 p-2.5 font-bold text-left',
        },
      }),
      TiptapTableCell.configure({
        HTMLAttributes: {
          class: 'border border-slate-200 dark:border-zinc-800 p-2.5 text-left',
        },
      }),
    ],
    content: dbValue,
    editable: editMode,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      revisionRef.current += 1
      triggerLocalContentChange(html)
      updateMentionMenu(editor)
    },
    onSelectionUpdate: ({ editor }) => {
      updateMentionMenu(editor)
    },
    editorProps: {
      handleClick: (_view, pos, event) => {
        const target = event.target as HTMLElement
        if (target.tagName === 'IMG') {
          setSelectedImageNode({
            element: target as HTMLImageElement,
            pos
          })
          return true
        } else {
          setSelectedImageNode(null)
        }
      },
      handleKeyDown: (view, event) => {
        const menu = mentionMenuRef.current
        const activeIdx = activeMentionIndexRef.current

        if (event.key === 'Backspace') {
          const { state, dispatch } = view
          const { selection } = state
          if (selection.empty) {
            const $from = selection.$from
            const nodeBefore = $from.nodeBefore
            if (nodeBefore && nodeBefore.type.name === 'image') {
              const tr = state.tr.delete($from.pos - nodeBefore.nodeSize, $from.pos)
              dispatch(tr)
              return true
            }
          }
        }

        if (menu && menu.open) {
          const filteredImgs = attachedImagesRef.current.filter(img =>
            !menu.query || img.name.toLowerCase().includes(menu.query.toLowerCase())
          )
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveMentionIndex((activeIdx + 1) % filteredImgs.length)
            return true
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveMentionIndex((activeIdx - 1 + filteredImgs.length) % filteredImgs.length)
            return true
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            if (filteredImgs[activeIdx]) {
              insertFromMention(filteredImgs[activeIdx].data, filteredImgs[activeIdx].name)
            }
            return true
          }
          if (event.key === 'Escape') {
            setMentionMenu(null)
            return true
          }
        }
        return false
      }
    }
  })

  // Synchronise content edits between dates or store state updates
  useEffect(() => {
    if (!editor) return
    const entryId = activeEntry?.id || null
    if (activeDate !== loadedDateRef.current || entryId !== loadedEntryIdRef.current) {
      const adapted = JournalContentAdapter.toEditor(activeEntry?.content)
      editor.commands.setContent(adapted, { emitUpdate: false })
      loadedDateRef.current = activeDate
      loadedEntryIdRef.current = entryId
      // Reset revisions on entry swap
      revisionRef.current = 0
      savedRevisionRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, activeEntry?.id, editor])

  // Synchronise editor editability
  useEffect(() => {
    if (editor) {
      editor.setEditable(editMode)
    }
  }, [editMode, editor])

  // Synchronise content edits when activeDate, activeEntry, or dbValue changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContent(dbValue)
    setAttachedImages(getMetadataImages(activeEntry))
    setMentionMenu(null)
    setContentStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, dbValue])

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

  // Autosave triggers
  useEffect(() => {
    if (!editMode) return
    const dbVal = JournalContentAdapter.toEditor(activeEntry?.content)
    if (content === dbVal) return
    const currentRev = revisionRef.current
    const t = setTimeout(() => saveContent(content, currentRev), 1000)
    return () => clearTimeout(t)
  }, [content, activeEntry?.content, saveContent, editMode])

  const handleExitEdit = async () => {
    if (content !== dbValue) {
      await saveContent(content, revisionRef.current)
    }
    setEditMode(false)
  }

  const handleDelete = async (id: string, dateStr: string) => {
    if (confirm('Are you sure you want to delete this journal entry?')) {
      await deleteJournalAction(id)
      if (activeDate === dateStr) handleNavigateDate(today)
    }
  }

  const handleNavigateDate = (targetDateStr: string) => {
    if (editMode && content !== dbValue) {
      if (!confirm('You have unsaved changes. Are you sure you want to discard them and switch dates?')) {
        return
      }
    }
    setEditMode(false)
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
    editor?.chain().focus().setImage({ src, alt: name }).run()
  }

  const insertFromMention = (src: string, name?: string) => {
    if (!editor) return
    const { selection } = editor.state
    const $from = selection.$from
    const textBefore = $from.parent.textBetween(
      Math.max(0, $from.parentOffset - 50),
      $from.parentOffset,
      undefined,
      ' '
    )
    const match = textBefore.match(/@([^\s]*)$/)
    if (match) {
      const startPos = selection.from - match[0].length
      editor.chain().focus()
        .deleteRange({ from: startPos, to: selection.from })
        .setImage({ src, alt: name })
        .run()
    } else {
      editor.chain().focus().setImage({ src, alt: name }).run()
    }
    setMentionMenu(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editMode) return
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
      <main className={`flex-1 flex flex-col xl:flex-row bg-[var(--color-bg-base)] relative overflow-hidden ${mobileView === 'list' ? 'hidden md:flex' : 'flex'} ${editMode ? 'max-md:fixed max-md:inset-0 max-md:z-50 max-md:h-screen max-md:w-screen' : ''}`}>
        
        {/* Editor Writing Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-12 py-6 sm:py-10 pb-24 border-r border-[var(--color-border)]/50">
          <div className="max-w-5xl mx-auto w-full flex flex-col gap-6">
            
            <div className="flex items-center justify-between flex-wrap gap-3">
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
                <div />
              )}
              
                          {/* Date Navigation & Picker */}
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-900/50 p-1.5 border border-[var(--color-border)] rounded-xl">
                <Button variant="outline" size="icon-sm" onClick={() => navigateDay('prev')} icon={<ChevronLeft size={14} />} title="Previous Day" />
                <input
                  type="date"
                  value={activeDate}
                  onChange={e => handleNavigateDate(e.target.value)}
                  className="bg-transparent border-0 font-bold text-xs text-[var(--color-text-main)] w-32 cursor-pointer focus:outline-hidden"
                />
                <Button variant="outline" size="icon-sm" onClick={() => navigateDay('next')} icon={<ChevronRight size={14} />} title="Next Day" />
              </div>

              {/* Read / Edit Mode controls */}
              <div className="flex items-center gap-2">
                <SyncStatus status={editMode || contentStatus === 'saving' ? contentStatus : 'idle'} />
                {!editMode ? (
                  <Button onClick={() => setEditMode(true)} size="sm" icon={<Edit3 className="w-3.5 h-3.5" />}>Edit</Button>
                ) : (
                  <Button
                    onClick={() => handleExitEdit()}
                    variant="ghost"
                    size="icon-sm"
                    icon={<X className="w-4 h-4" />}
                    title="Exit Edit Mode"
                  />
                )}
              </div>
            </div>

            <div className="border-b border-slate-100 dark:border-zinc-900/40 pb-4">
              <h1 className="text-xl sm:text-3xl font-black text-[var(--color-text-main)] tracking-tight">
                {fmtDateFull(activeDate + 'T12:00:00Z')}
              </h1>
            </div>

            {/* Rich Formatting Toolbar (Only visible in Edit Mode) */}
            {editMode && editor && (
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-lg)] max-w-max animate-fade-in">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().undo().run() }}
                  title="Undo (Ctrl+Z)"
                  icon={<Undo2 size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().redo().run() }}
                  title="Redo (Ctrl+Y)"
                  icon={<Redo2 size={13} />}
                />
                <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
                  title="Bold (Ctrl+B)"
                  icon={<Bold size={13} />}
                  className={editor.isActive('bold') ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
                  title="Italic (Ctrl+I)"
                  icon={<Italic size={13} />}
                  className={editor.isActive('italic') ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
                  title="Underline (Ctrl+U)"
                  icon={<Underline size={13} />}
                  className={editor.isActive('underline') ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run() }}
                  title="Highlight text"
                  icon={<Highlighter size={13} />}
                  className={editor.isActive('highlight') ? 'bg-[var(--color-accent)]' : ''}
                />
                <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }}
                  title="Heading 1"
                  icon={<Heading1 size={13} />}
                  className={editor.isActive('heading', { level: 1 }) ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}
                  title="Heading 2"
                  icon={<Heading2 size={13} />}
                  className={editor.isActive('heading', { level: 2 }) ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
                  title="Bullet List"
                  icon={<List size={13} />}
                  className={editor.isActive('bulletList') ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run() }}
                  title="Blockquote"
                  icon={<Quote size={13} />}
                  className={editor.isActive('blockquote') ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run() }}
                  title="Code Block"
                  icon={<Code size={13} />}
                  className={editor.isActive('codeBlock') ? 'bg-[var(--color-accent)]' : ''}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click() }}
                  title="Attach Image"
                  icon={<ImageIcon size={13} />}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Insert or manage table"
                      icon={<TableIcon size={13} />}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48 text-xs">
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }}>
                      Insert 3x3 Table
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().addColumnBefore().run() }}>
                      Add Column Before
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run() }}>
                      Add Column After
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run() }}>
                      Delete Column
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().addRowBefore().run() }}>
                      Add Row Before
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run() }}>
                      Add Row After
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().deleteRow().run() }}>
                      Delete Row
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={e => { e.preventDefault(); editor.chain().focus().deleteTable().run() }} className="text-rose-500">
                      Delete Table
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetAllMarks().clearNodes().run() }}
                  title="Clear all formatting"
                  icon={<Eraser size={13} />}
                  className="hover:text-rose-500"
                />
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              multiple
            />

            <EditorContent 
              editor={editor} 
              className="w-full mt-4 bg-transparent text-[17px] text-[var(--color-text-main)] placeholder-slate-350 dark:placeholder-zinc-700 focus:outline-hidden leading-[1.85] resize-none font-serif min-h-[350px] border-0 p-0 outline-hidden contenteditable-editor"
            />

            {/* Empty state CTA — shown in read mode when no content */}
            {!editMode && (!content || content === '<p></p>' || content.trim() === '') && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <Edit3 className="w-5 h-5 text-[var(--color-primary)]" />
                </div>
                <div>
                  <p className="text-base font-bold text-[var(--color-text-main)]">Nothing written yet</p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">Capture your thoughts for {fmtDateFull(activeDate + 'T12:00:00Z')}</p>
                </div>
                <Button
                  onClick={() => setEditMode(true)}
                  size="sm"
                  icon={<Edit3 className="w-3.5 h-3.5" />}
                >
                  Write Entry
                </Button>
              </div>
            )}

            {/* Mention Menu */}
            {mentionMenu && (
              <div 
                className="fixed z-50 bg-white dark:bg-zinc-900 border border-slate-205/65 dark:border-zinc-800 rounded-lg p-1.5 shadow-xl animate-fade-in w-64 max-h-48 overflow-y-auto space-y-0.5"
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
                    ).map((img, idx) => {
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
                  <p className="text-[10px] text-slate-450 dark:text-zinc-500 font-bold p-2 leading-normal">No matching memories.</p>
                )}
              </div>
            )}

            {/* Image Resize Toolbar (Jira-style sizing presets) */}
            {selectedImageNode && editMode && (
              <div 
                className="fixed z-50 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-1 shadow-lg flex items-center gap-1 animate-fade-in"
                style={{
                  top: `${selectedImageNode.element.getBoundingClientRect().top + window.scrollY - 45}px`,
                  left: `${selectedImageNode.element.getBoundingClientRect().left + window.scrollX}px`,
                }}
              >
                {(['25%', '50%', '100%', 'original'] as const).map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => resizeSelectedImage(size === 'original' ? '100%' : size)}
                    className="px-2 py-1 text-[11px] font-bold rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)]"
                  >
                    {size}
                  </button>
                ))}
                <div className="w-px h-3 bg-slate-200 dark:bg-zinc-800 mx-1" />
                <button
                  type="button"
                  onClick={() => setSelectedImageNode(null)}
                  className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Memories Section (Mobile & Tablet Layout) */}
            {(attachedImages.length > 0 || editMode) && (
              <div className="xl:hidden mt-8 pt-8 border-t border-slate-100 dark:border-zinc-900/60">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Memories</h3>
                  {editMode && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
                    >
                      <Upload size={11} /> Attach
                    </button>
                  )}
                </div>
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
                    {editMode && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-lg border-2 border-dashed border-slate-200 dark:border-zinc-800 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] text-[var(--color-text-muted)] transition-colors flex flex-col items-center justify-center gap-1 text-[10px] font-bold"
                      >
                        <Upload size={13} />
                        Add
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-8 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors flex flex-col items-center gap-2"
                  >
                    <Upload size={16} />
                    Attach a photo
                  </button>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Memories Gallery Panel (Desktop Sidebar Layout) — only shown when images exist or editing */}
        {(attachedImages.length > 0 || editMode) && (
          <aside className="w-64 shrink-0 bg-[var(--color-bg-subtle)]/30 p-5 overflow-y-auto hidden xl:block border-l border-[var(--color-border)]/50">
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Memories</h3>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold mt-0.5">Photos in this entry</p>
                </div>
                {editMode && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
                  >
                    <Upload size={11} /> Add
                  </button>
                )}
              </div>

              {attachedImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5">
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
                  {editMode && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed border-slate-200 dark:border-zinc-800 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] text-[var(--color-text-muted)] transition-colors flex flex-col items-center justify-center gap-1 text-[10px] font-bold"
                    >
                      <Upload size={14} />
                      Add
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-10 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-lg text-[11px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors flex flex-col items-center gap-2"
                >
                  <Upload size={16} />
                  Attach a photo
                </button>
              )}
            </div>
          </aside>
        )}

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
