"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/lib/store/store'

import {
  Trash2, CheckCircle2, CloudOff, Loader2, Edit3, PlusCircle,
  Bold, Italic, Underline, Code, List, Heading1, Heading2, Highlighter, Quote, Undo2, Redo2, Eraser, Image as ImageIcon, X, ArrowLeft,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import { Button, SearchInput } from '@/design-system'
import { useSearchParams, useRouter } from 'next/navigation'


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


const generatePlaceholderId = (): string => {
  return `img-upload-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

export const JournalPanel: React.FC<JournalPanelProps> = ({ initialEntries }) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const dateParam = searchParams?.get('date')

  console.log('[JournalPanel] Initialized with entries:', initialEntries.length)
  initialEntries.forEach(e => {
    console.log(`  - ${e.id}: ${e.journalDate}, content length: ${e.content.length}`)
  })
  
  const today = todayYMD()
  const { state, initialize, upsertJournalAction, deleteJournalAction } = useStore()

  useEffect(() => {
    initialize({ journalEntries: initialEntries })
  }, [initialEntries, initialize])

  const entries = state.journalEntries.length > 0 ? state.journalEntries : initialEntries
  const [activeDate, setActiveDate] = useState<string>(() => dateParam || today)
  const [editMode, setEditMode] = useState(false)

  // Version-aware refs
  const contentVersionRef = useRef(0)
  const lastSavedVersionRef = useRef(0)
  const pendingVersionRef = useRef<number | null>(null)
  
  // Pending image base64s map for retry
  const pendingBase64s = useRef<Record<string, string>>({})

  useEffect(() => {
    if (dateParam) {
      const timer = setTimeout(() => {
        setActiveDate(dateParam)
        setEditMode(false)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [dateParam])

  const [search, setSearch] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('editor')
  
  // Editor states for active date
  const activeEntry = entries.find(e => toYMD(e.journalDate) === activeDate) || null
  const dbValue = markdownToHtml(activeEntry?.content || '')
  
  console.log('[JournalPanel] Active date:', activeDate, 'Active entry:', activeEntry ? `${activeEntry.id} (${activeEntry.content.length} chars)` : 'null')
  
  const [content, setContent] = useState(dbValue)
  const [contentStatus, setContentStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const isSavingRef = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  const hasChanges = content !== dbValue

  const triggerLocalContentChange = (html: string) => {
    setContent(html)
    contentVersionRef.current += 1
    setContentStatus('saving')
  }

  const saveContent = useCallback(async (v: string, version: number) => {
    console.log('[JournalPanel] saveContent called with:', { 
      length: v.length, 
      preview: v.substring(0, 100),
      activeDate,
      version
    })
    
    if (isSavingRef.current) { 
      pendingRef.current = v
      pendingVersionRef.current = version
      return 
    }
    isSavingRef.current = true
    setContentStatus('saving')
    try {
      await upsertJournalAction(activeDate, { content: v })
      if (version >= lastSavedVersionRef.current) {
        lastSavedVersionRef.current = version
        setContentStatus('saved')
      }
    } catch (err) {
      console.error('[JournalPanel] Save error:', err)
      setContentStatus('error')
    } finally {
      isSavingRef.current = false
      if (pendingRef.current !== null && pendingVersionRef.current !== null) {
        const next = pendingRef.current
        const nextVer = pendingVersionRef.current
        pendingRef.current = null
        pendingVersionRef.current = null
        saveContent(next, nextVer)
      }
    }
  }, [activeDate, upsertJournalAction])

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
            triggerLocalContentChange(editorRef.current.innerHTML)
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
      triggerLocalContentChange(editorRef.current.innerHTML)
    }
  }

  const clearFormatting = () => {
    if (typeof window === 'undefined') return
    document.execCommand('removeFormat')
    document.execCommand('formatBlock', false, '<p>')
    if (editorRef.current) {
      triggerLocalContentChange(editorRef.current.innerHTML)
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
      await upsertJournalAction(activeDate, { metadata: { images: imgs } })
      setContentStatus('saved')
    } catch (err) {
      console.error(err)
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
      triggerLocalContentChange(html)

      setAttachedImages(prev => {
        if (prev.some(item => item.data === src)) return prev
        const updated = [...prev, { name: imgName, data: src }]
        saveMetadata(updated)
        return updated
      })
    }
  }

  const insertPlaceholderHTML = (placeholderId: string, name: string) => {
    if (editorRef.current) {
      editorRef.current.focus()
      const html = `<div id="${placeholderId}" class="image-upload-placeholder animate-pulse p-4 border border-dashed border-slate-300 dark:border-zinc-700 rounded-lg flex items-center justify-center bg-slate-50 dark:bg-zinc-900 text-xs text-slate-500 dark:text-zinc-400 font-bold my-4" contenteditable="false">Uploading "${name}"... 0%</div>`
      document.execCommand('insertHTML', false, html)
      triggerLocalContentChange(editorRef.current.innerHTML)
    }
  }

  const performUpload = (placeholderId: string, name: string, base64: string) => {
    let progress = 0
    const placeholderEl = document.getElementById(placeholderId)
    if (placeholderEl) {
      placeholderEl.className = "image-upload-placeholder animate-pulse p-4 border border-dashed border-slate-300 dark:border-zinc-700 rounded-lg flex items-center justify-center bg-slate-50 dark:bg-zinc-900 text-xs text-slate-500 dark:text-zinc-400 font-bold my-4"
      placeholderEl.innerHTML = `Uploading "${name}"... 0%`
    }
    
    const interval = setInterval(() => {
      progress += 25
      const el = document.getElementById(placeholderId)
      if (el) {
        el.innerHTML = `Uploading "${name}"... ${progress}%`
      }
      if (progress >= 100) {
        clearInterval(interval)
        
        if (name.toLowerCase().includes('fail')) {
          const elFail = document.getElementById(placeholderId)
          if (elFail) {
            elFail.className = "image-upload-placeholder p-4 border border-rose-300 dark:border-rose-900 rounded-lg flex flex-col items-center justify-center bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-500 font-bold my-4"
            elFail.innerHTML = ""

            const titleDiv = document.createElement('div')
            titleDiv.textContent = `Upload failed for "${name}"`
            elFail.appendChild(titleDiv)

            const btnContainer = document.createElement('div')
            btnContainer.className = "flex gap-2 mt-2"

            const retryBtn = document.createElement('button')
            retryBtn.type = "button"
            retryBtn.className = "px-2 py-1 bg-rose-500 text-white text-[10px] rounded hover:bg-rose-600 cursor-pointer"
            retryBtn.textContent = "Retry"
            retryBtn.addEventListener('click', (ev) => {
              ev.preventDefault()
              const pendingBase64 = pendingBase64s.current[placeholderId]
              if (pendingBase64) {
                performUpload(placeholderId, name, pendingBase64)
              }
            })

            const removeBtn = document.createElement('button')
            removeBtn.type = "button"
            removeBtn.className = "px-2 py-1 bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 text-[10px] rounded hover:bg-slate-300 cursor-pointer"
            removeBtn.textContent = "Remove"
            removeBtn.addEventListener('click', (ev) => {
              ev.preventDefault()
              elFail.remove()
              if (editorRef.current) {
                triggerLocalContentChange(editorRef.current.innerHTML)
              }
            })

            btnContainer.appendChild(retryBtn)
            btnContainer.appendChild(removeBtn)
            elFail.appendChild(btnContainer)
          }
          return
        }

        // Success
        const elSuccess = document.getElementById(placeholderId)
        if (elSuccess && editorRef.current) {
          const imgHtml = `<img src="${base64}" alt="${name}" class="max-w-full my-4 rounded-lg border border-slate-200 dark:border-zinc-800 shadow-sm transition-transform hover:scale-[1.01]" style="max-height: 380px; object-fit: contain; display: block;" />`
          const temp = document.createElement('div')
          temp.innerHTML = imgHtml
          const imgNode = temp.firstChild!
          elSuccess.parentNode?.replaceChild(imgNode, elSuccess)
          
          const updatedHtml = editorRef.current.innerHTML
          triggerLocalContentChange(updatedHtml)
          saveContent(updatedHtml, contentVersionRef.current)
          
          setAttachedImages(prev => {
            if (prev.some(item => item.data === base64)) return prev
            const updated = [...prev, { name, data: base64 }]
            saveMetadata(updated)
            return updated
          })
          
          delete pendingBase64s.current[placeholderId]
        }
      }
    }, 300)
  }

  const uploadImageWithPlaceholder = (file: File) => {
    const placeholderId = generatePlaceholderId()
    insertPlaceholderHTML(placeholderId, file.name)
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      pendingBase64s.current[placeholderId] = base64
      performUpload(placeholderId, file.name, base64)
    }
    reader.readAsDataURL(file)
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
    if (!editMode) return
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (file) {
          uploadImageWithPlaceholder(file)
        }
      }
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!editMode) return
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = files[i]
          uploadImageWithPlaceholder(file)
        }
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editMode) return
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => {
        uploadImageWithPlaceholder(file)
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
      return
    }

    if (e.key === 'Enter') {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const textNode = range.startContainer
        const offset = range.startOffset
        
        if (textNode.nodeType === Node.TEXT_NODE) {
          const text = textNode.textContent || ''
          const textBeforeCursor = text.slice(0, offset)
          const textAfterCursor = text.slice(offset)
          
          const lastLineIndex = Math.max(textBeforeCursor.lastIndexOf('\n'), textBeforeCursor.lastIndexOf('\r'))
          const currentLine = lastLineIndex === -1 ? textBeforeCursor : textBeforeCursor.slice(lastLineIndex + 1)
          
          let prefix = ''
          let isMatch = false
          let nextPrefix = ''
          
          if (currentLine.match(/^-\s+\[\s*\]\s*/)) {
            const m = currentLine.match(/^-\s+\[\s*\]\s*/)!
            prefix = m[0]
            nextPrefix = '- [ ] '
            isMatch = true
          } else if (currentLine.match(/^-\s*/)) {
            const m = currentLine.match(/^-\s*/)!
            prefix = m[0]
            nextPrefix = '- '
            isMatch = true
          } else if (currentLine.match(/^\*\s*/)) {
            const m = currentLine.match(/^\*\s*/)!
            prefix = m[0]
            nextPrefix = '* '
            isMatch = true
          } else if (currentLine.match(/^(\d+)\.\s*/)) {
            const m = currentLine.match(/^(\d+)\.\s*/)!
            prefix = m[0]
            const num = parseInt(m[1], 10)
            nextPrefix = `${num + 1}. `
            isMatch = true
          }
          
          if (isMatch) {
            e.preventDefault()
            
            if (currentLine.trim() === prefix.trim()) {
              // Exit list: delete the list prefix on the current line
              const newText = text.slice(0, offset - currentLine.length) + textAfterCursor
              textNode.textContent = newText
              
              const newRange = document.createRange()
              newRange.setStart(textNode, offset - currentLine.length)
              newRange.collapse(true)
              selection.removeAllRanges()
              selection.addRange(newRange)
              
              if (editorRef.current) {
                setContent(editorRef.current.innerHTML)
                setContentStatus('saving')
              }
            } else {
              // Continue list: insert newline + nextPrefix
              const insertText = '\n' + nextPrefix
              const newText = textBeforeCursor + insertText + textAfterCursor
              textNode.textContent = newText
              
              const newRange = document.createRange()
              newRange.setStart(textNode, offset + insertText.length)
              newRange.collapse(true)
              selection.removeAllRanges()
              selection.addRange(newRange)
              
              if (editorRef.current) {
                setContent(editorRef.current.innerHTML)
                setContentStatus('saving')
              }
            }
          }
        }
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

  // Navigate with unsaved changes confirmation
  const handleNavigateDate = (targetDateStr: string) => {
    if (editMode && hasChanges) {
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

  // Sync editor innerHTML when switching journal entry dates
  useEffect(() => {
    if (editorRef.current) {
      const dbVal = markdownToHtml(activeEntry?.content || '')
      if (editorRef.current.innerHTML !== dbVal) {
        editorRef.current.innerHTML = dbVal
      }
    }
  }, [activeDate, activeEntry?.content])

  const [prevActiveDate, setPrevActiveDate] = useState(activeDate)
  const [prevActiveEntryId, setPrevActiveEntryId] = useState(activeEntry?.id)

  if (activeDate !== prevActiveDate || activeEntry?.id !== prevActiveEntryId) {
    setContent(dbValue)
    setAttachedImages(getMetadataImages(activeEntry))
    setMentionMenu(null)
    setContentStatus('idle')
    setPrevActiveDate(activeDate)
    setPrevActiveEntryId(activeEntry?.id)
  }

  // Debounced autosave
  useEffect(() => {
    if (!editMode) return
    const dbVal = markdownToHtml(activeEntry?.content || '')
    if (content === dbVal) return
    const t = setTimeout(() => saveContent(content, contentVersionRef.current), 1500)
    return () => clearTimeout(t)
  }, [content, activeEntry?.content, saveContent, editMode])

  const handleDelete = async (id: string, dateStr: string) => {
    if (confirm('Are you sure you want to delete this journal entry?')) {
      await deleteJournalAction(id)
      if (activeDate === dateStr) handleNavigateDate(today)
    }
  }

  const handleSave = async () => {
    await saveContent(content, contentVersionRef.current)
    setEditMode(false)
  }

  const handleCancel = () => {
    if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to discard them?')) {
      return
    }
    setContent(dbValue)
    if (editorRef.current) {
      editorRef.current.innerHTML = dbValue
    }
    setEditMode(false)
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
              onClick={() => handleNavigateDate(today)}
              variant="ghost"
              size="sm"
              icon={<Edit3 className="w-4 h-4" strokeWidth={2.5} />}
              title="New Entry (Today)"
            />
          </div>

          <SearchInput
            value={search}
            onValueChange={setSearch}
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
                onClick={() => handleNavigateDate(dateStr)}
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
                  className={`absolute right-2 bottom-2 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 rounded-lg transition-colors ${
                    isActive ? 'text-white hover:bg-white/20' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                  }`}
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
              No entries found.
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT WORKSPACE: Canvas ── */}
      <main className={`flex-1 flex flex-col xl:flex-row bg-white dark:bg-[#09090b] relative overflow-hidden ${mobileView === 'list' ? 'hidden md:flex' : 'flex'} ${editMode ? 'max-md:fixed max-md:inset-0 max-md:z-50 max-md:h-screen max-md:w-screen' : ''}`}>
        {/* Editor Writing Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-12 py-6 sm:py-10 pb-24 border-r border-slate-100 dark:border-zinc-900/60">
          <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
            
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
                <SyncStatus status={contentStatus} />
                {!editMode ? (
                  <Button onClick={() => setEditMode(true)} size="sm" icon={<Edit3 className="w-3.5 h-3.5" />}>Edit</Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => handleCancel()}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={() => handleSave()} disabled={!hasChanges}>Save</Button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-b border-slate-100 dark:border-zinc-900/40 pb-4">
              <h1 className="text-xl sm:text-3xl font-black text-[var(--color-text-main)] tracking-tight">
                {formatJournalDate(activeDate + 'T12:00:00Z')}
              </h1>
            </div>

            {/* Rich Formatting Toolbar (Only visible in Edit Mode) */}
            {editMode && (
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-50 dark:bg-zinc-900/50 border border-slate-205/65 dark:border-zinc-800/80 rounded-lg max-w-max animate-fade-in">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('undo') }}
                  title="Undo (Ctrl+Z)"
                  icon={<Undo2 size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('redo') }}
                  title="Redo (Ctrl+Y)"
                  icon={<Redo2 size={13} />}
                />
                <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('bold') }}
                  title="Bold (Ctrl+B)"
                  icon={<Bold size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('italic') }}
                  title="Italic (Ctrl+I)"
                  icon={<Italic size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('underline') }}
                  title="Underline (Ctrl+U)"
                  icon={<Underline size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('hiliteColor', '#fef08a') }}
                  title="Highlight text"
                  icon={<Highlighter size={13} />}
                />
                <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<h1>') }}
                  title="Heading 1"
                  icon={<Heading1 size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<h2>') }}
                  title="Heading 2"
                  icon={<Heading2 size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList') }}
                  title="Bullet List"
                  icon={<List size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<blockquote>') }}
                  title="Blockquote"
                  icon={<Quote size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', '<pre>') }}
                  title="Code Block"
                  icon={<Code size={13} />}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click() }}
                  title="Attach Image"
                  icon={<ImageIcon size={13} />}
                />
                <div className="w-px h-3.5 bg-slate-200 dark:bg-zinc-800 mx-1" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={e => { e.preventDefault(); clearFormatting() }}
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

            <div
              ref={editorRef}
              contentEditable={editMode}
              suppressContentEditableWarning
              onInput={e => {
                triggerLocalContentChange(e.currentTarget.innerHTML)
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

