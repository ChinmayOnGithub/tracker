"use client"

import React, { useState, useEffect, useRef } from 'react'
import { X, Loader2, Lock } from 'lucide-react'
import { createLink, updateLink, checkDuplicateLink } from '@/app/actions/links'
import { SavedLink, LinkTagItem } from '../LinkLibraryPanel'
import { Modal, Button, Input, Textarea } from '@/design-system'

interface LinkModalProps {
  isOpen: boolean
  onClose: () => void
  editingLink: SavedLink | null
  activeCollectionId: string
  tagsList: LinkTagItem[]
  onSaved: (link: SavedLink, isNew: boolean) => void
  onDuplicateWarning: (warning: {
    exists: boolean
    link?: { id: string; title: string; url: string; collectionId: string; collectionName: string }
  }) => void
}

export const LinkModal: React.FC<LinkModalProps> = ({
  isOpen,
  onClose,
  editingLink,
  activeCollectionId,
  tagsList,
  onSaved,
  onDuplicateWarning,
}) => {
  const [url, setUrl] = useState(editingLink ? editingLink.url : '')
  const [title, setTitle] = useState(editingLink ? editingLink.title : '')
  const [desc, setDesc] = useState(editingLink ? (editingLink.description || '') : '')
  const [notes, setNotes] = useState(editingLink ? (editingLink.notes || '') : '')
  const [tags, setTags] = useState<string[]>(editingLink ? (editingLink.tags ? editingLink.tags.map(t => t.name) : []) : [])
  const [tagInput, setTagInput] = useState('')
  const [favicon, setFavicon] = useState(editingLink ? (editingLink.favicon || '') : '')
  const [thumbnail, setThumbnail] = useState(editingLink ? (editingLink.thumbnail || '') : '')
  const [isPrivateOnly, setIsPrivateOnly] = useState(editingLink ? editingLink.isPrivate : true)
  const [isFetchingMeta, setIsFetchingMeta] = useState(false)
  const [loading, setLoading] = useState(false)

  // Background Scraper when typing URL
  const prevFetchedUrlRef = useRef('')
  useEffect(() => {
    if (!url || editingLink || !isOpen) return
    let trimmed = url.trim()
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      if (trimmed.includes('.')) {
        trimmed = 'https://' + trimmed
      } else {
        return
      }
    }

    if (trimmed === prevFetchedUrlRef.current) return

    const timer = setTimeout(async () => {
      prevFetchedUrlRef.current = trimmed
      setIsFetchingMeta(true)
      try {
        const res = await fetch(`/api/metadata?url=${encodeURIComponent(trimmed)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.title && !title) setTitle(data.title)
          if (data.description && !desc) setDesc(data.description)
          if (data.favicon) setFavicon(data.favicon)
          if (data.thumbnail) setThumbnail(data.thumbnail)
        }
      } catch (err) {
        console.error('Failed to fetch metadata:', err)
      } finally {
        setIsFetchingMeta(false)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [url, title, desc, editingLink, isOpen])

  if (!isOpen) return null

  const handleAddTag = (text: string) => {
    const cleaned = text.trim().toLowerCase().replace(/#/g, '')
    if (cleaned && !tags.includes(cleaned)) {
      setTags(prev => [...prev, cleaned])
    }
    setTagInput('')
  }

  const handleRemoveTag = (tagName: string) => {
    setTags(prev => prev.filter(t => t !== tagName.toLowerCase()))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || !activeCollectionId) return
    setLoading(true)

    let finalUrl = url.trim()
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl
    }

    // Duplicate detection check
    if (!editingLink) {
      const dup = await checkDuplicateLink(finalUrl)
      if (dup.exists) {
        onDuplicateWarning({
          exists: true,
          link: dup.link
        })
        setLoading(false)
        return
      }
    }

    const payload = {
      url: finalUrl,
      title: title.trim() || finalUrl,
      description: desc.trim() || null,
      favicon: favicon.trim() || null,
      thumbnail: thumbnail.trim() || null,
      isPrivate: isPrivateOnly,
      notes: notes.trim() || null,
      tags: tags
    }

    try {
      if (editingLink) {
        const res = await updateLink(editingLink.id, payload)
        if (res.success && res.link) {
          const updated: SavedLink = {
            ...editingLink,
            url: res.link.url,
            title: res.link.title,
            description: res.link.description,
            favicon: res.link.favicon,
            thumbnail: res.link.thumbnail,
            notes: res.link.notes,
            isPrivate: res.link.isPrivate,
            tags: (res.link.tags || []).map((t: LinkTagItem) => ({ id: t.id, name: t.name, color: t.color }))
          }
          onSaved(updated, false)
          onClose()
        }
      } else {
        const res = await createLink(activeCollectionId, payload)
        if (res.success && res.link) {
          const created: SavedLink = {
            id: res.link.id,
            collectionId: activeCollectionId,
            url: res.link.url,
            title: res.link.title,
            description: res.link.description,
            favicon: res.link.favicon,
            thumbnail: res.link.thumbnail,
            accentColor: res.link.accentColor,
            notes: res.link.notes,
            sortOrder: res.link.sortOrder,
            isPinned: res.link.isPinned,
            isPrivate: res.link.isPrivate,
            isArchived: res.link.isArchived,
            openCount: res.link.openCount,
            lastOpenedAt: res.link.lastOpenedAt ? res.link.lastOpenedAt.toISOString() : null,
            tags: (res.link.tags || []).map((t: LinkTagItem) => ({ id: t.id, name: t.name, color: t.color })),
            createdAt: res.link.createdAt.toISOString(),
            updatedAt: res.link.updatedAt.toISOString()
          }
          onSaved(created, true)
          onClose()
        }
      }
    } catch (err) {
      console.error('Failed to save link:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingLink ? 'Edit Link' : 'Add New Link'}>
      <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              label="Link URL"
              type="text"
              required
              placeholder="https://example.com/some-page"
              value={url}
              onChange={e => setUrl(e.target.value)}
              helperText="Type or paste URL. Title, summary & thumbnail will auto-fetch in background."
              suffix={isFetchingMeta ? <Loader2 size={13} className="animate-spin text-slate-400" /> : undefined}
            />
          </div>

          <div>
            <Input
              label="Title (Optional)"
              type="text"
              placeholder="e.g. Apple News, Tutorial video (Autofills if blank)"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Textarea
              label="Short Summary (Optional)"
              placeholder="Website description (autofills if blank)..."
              rows={2}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="mb-3"
            />

            <Textarea
              label="Personal Notes (Optional)"
              placeholder="Add custom notes, guidelines, or keywords..."
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Tags (Optional)</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map(t => (
                <span 
                  key={t}
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 animate-fade-in"
                >
                  #{t}
                  <button 
                    type="button" 
                    onClick={() => handleRemoveTag(t)}
                    className="text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Add tag..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    handleAddTag(tagInput)
                  }
                }}
                className="flex-grow"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleAddTag(tagInput)}
                type="button"
              >
                Add
              </Button>
            </div>
            
            {/* Tag presets/suggestions */}
            {tagsList.length > 0 && (
              <div className="mt-2.5">
                <span className="text-[9px] text-slate-400 dark:text-zinc-550 font-bold block mb-1">Click to toggle recent:</span>
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto p-0.5">
                  {tagsList.map(tag => {
                    const hasTag = tags.includes(tag.name.toLowerCase())
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          if (hasTag) {
                            handleRemoveTag(tag.name)
                          } else {
                            handleAddTag(tag.name)
                          }
                        }}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                          hasTag 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400' 
                            : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-zinc-900/60 dark:border-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        #{tag.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--color-border)] flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="privateOnly"
                checked={isPrivateOnly}
                onChange={e => setIsPrivateOnly(e.target.checked)}
                className="rounded-sm border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] mt-0.5 shrink-0"
              />
              <div className="flex flex-col">
                <label htmlFor="privateOnly" className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 select-none cursor-pointer flex items-center gap-1">
                  <Lock size={10} />
                  <span>Privacy Copy Option</span>
                </label>
                <p className="text-[9px] text-slate-400 dark:text-zinc-550 leading-relaxed font-semibold">
                  Adds a clipboard copying action to paste directly into your incognito window.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--color-border)]/50 pt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={onClose}
                type="button"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                loading={loading}
                disabled={loading}
              >
                {editingLink ? 'Save' : 'Add Link'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
  )
}
