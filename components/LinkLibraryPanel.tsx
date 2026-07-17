"use client"

import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Search, FolderPlus, ExternalLink, Edit2, Trash2,
  Grid, List, Lock, Folder, Play, Check, Loader2, X
} from 'lucide-react'
import {
  createLinkCollection, updateLinkCollection, deleteLinkCollection,
  createLink, updateLink, deleteLink
} from '@/app/actions/links'

interface SavedLink {
  id: string
  collectionId: string
  url: string
  title: string
  description: string | null
  favicon: string | null
  thumbnail: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface LinkCollection {
  id: string
  name: string
  color: string
  sortOrder: number
  links: SavedLink[]
}

interface LinkLibraryPanelProps {
  initialCollections: LinkCollection[]
}

const COLLECTION_COLORS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#eab308', // Yellow
  '#f97316', // Orange
  '#ef4444', // Red
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#64748b', // Slate
]

export const LinkLibraryPanel: React.FC<LinkLibraryPanelProps> = ({ initialCollections }) => {
  const [collections, setCollections] = useState<LinkCollection[]>(initialCollections)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
    initialCollections.length > 0 ? initialCollections[0].id : null
  )

  // Search & Filters
  const [linkSearchQuery, setLinkSearchQuery] = useState('')
  const [colSearchQuery, setColSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title'>('newest')

  // Modals / Actions
  const [isColModalOpen, setIsColModalOpen] = useState(false)
  const [editingCollection, setEditingCollection] = useState<LinkCollection | null>(null)
  const [newColName, setNewColName] = useState('')
  const [newColColor, setNewColColor] = useState(COLLECTION_COLORS[0])
  const [isColLoading, setIsColLoading] = useState(false)

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<SavedLink | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkDesc, setLinkDesc] = useState('')
  const [linkFavicon, setLinkFavicon] = useState('')
  const [linkThumbnail, setLinkThumbnail] = useState('')
  const [isPrivateOnly, setIsPrivateOnly] = useState(false) // Saves if URL has incognito suggestion

  const [isFetchingMeta, setIsFetchingMeta] = useState(false)
  const [isLinkLoading, setIsLinkLoading] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Active collection helper
  const activeCollection = collections.find(c => c.id === activeCollectionId)

  // Background Scraper when typing URL
  const prevFetchedUrlRef = useRef('')
  useEffect(() => {
    if (!linkUrl || editingLink) return
    let trimmed = linkUrl.trim()
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
          if (data.title && !linkTitle) setLinkTitle(data.title)
          if (data.description && !linkDesc) setLinkDesc(data.description)
          if (data.favicon) setLinkFavicon(data.favicon)
          if (data.thumbnail) setLinkThumbnail(data.thumbnail)
        }
      } catch (err) {
        console.error('Failed to fetch metadata:', err)
      } finally {
        setIsFetchingMeta(false)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [linkUrl, linkTitle, linkDesc, editingLink])

  // Handle Collection CRUD
  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newColName.trim()) return
    setIsColLoading(true)

    if (editingCollection) {
      const res = await updateLinkCollection(editingCollection.id, {
        name: newColName.trim(),
        color: newColColor
      })
      if (res.success && res.collection) {
        setCollections(prev => prev.map(c => c.id === editingCollection.id ? { ...c, name: res.collection!.name, color: res.collection!.color } : c))
        setIsColModalOpen(false)
      }
    } else {
      const res = await createLinkCollection(newColName.trim(), newColColor)
      if (res.success && res.collection) {
        const newCol: LinkCollection = {
          id: res.collection.id,
          name: res.collection.name,
          color: res.collection.color,
          sortOrder: res.collection.sortOrder,
          links: []
        }
        setCollections(prev => [...prev, newCol])
        setActiveCollectionId(newCol.id)
        setIsColModalOpen(false)
      }
    }
    setIsColLoading(false)
  }

  const handleDeleteCol = async (id: string) => {
    if (!confirm('Are you sure you want to delete this collection and all its links?')) return
    const res = await deleteLinkCollection(id)
    if (res.success) {
      setCollections(prev => prev.filter(c => c.id !== id))
      if (activeCollectionId === id) {
        const remaining = collections.filter(c => c.id !== id)
        setActiveCollectionId(remaining.length > 0 ? remaining[0].id : null)
      }
    }
  }

  const openAddCol = () => {
    setEditingCollection(null)
    setNewColName('')
    setNewColColor(COLLECTION_COLORS[0])
    setIsColModalOpen(true)
  }

  const openEditCol = (col: LinkCollection) => {
    setEditingCollection(col)
    setNewColName(col.name)
    setNewColColor(col.color)
    setIsColModalOpen(true)
  }

  // Handle Link CRUD
  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkUrl.trim() || !activeCollectionId) return
    setIsLinkLoading(true)

    let finalUrl = linkUrl.trim()
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl
    }

    const payload = {
      url: finalUrl,
      title: linkTitle.trim() || finalUrl,
      description: linkDesc.trim() || null,
      favicon: linkFavicon.trim() || null,
      thumbnail: linkThumbnail.trim() || null,
    }

    if (editingLink) {
      const res = await updateLink(editingLink.id, payload)
      if (res.success && res.link) {
        setCollections(prev => prev.map(c => {
          if (c.id === activeCollectionId) {
            return {
              ...c,
              links: c.links.map(l => l.id === editingLink.id ? {
                ...l,
                url: res.link!.url,
                title: res.link!.title,
                description: res.link!.description,
                favicon: res.link!.favicon,
                thumbnail: res.link!.thumbnail
              } : l)
            }
          }
          return c
        }))
        setIsLinkModalOpen(false)
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
          sortOrder: res.link.sortOrder,
          createdAt: res.link.createdAt.toISOString(),
          updatedAt: res.link.updatedAt.toISOString()
        }
        setCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, links: [...c.links, created] } : c))
        setIsLinkModalOpen(false)
      }
    }
    setIsLinkLoading(false)
  }

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return
    const res = await deleteLink(id)
    if (res.success) {
      setCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, links: c.links.filter(l => l.id !== id) } : c))
    }
  }

  const openAddLink = () => {
    setEditingLink(null)
    setLinkUrl('')
    setLinkTitle('')
    setLinkDesc('')
    setLinkFavicon('')
    setLinkThumbnail('')
    setIsPrivateOnly(false)
    prevFetchedUrlRef.current = ''
    setIsLinkModalOpen(true)
  }

  const openEditLink = (link: SavedLink) => {
    setEditingLink(link)
    setLinkUrl(link.url)
    setLinkTitle(link.title)
    setLinkDesc(link.description || '')
    setLinkFavicon(link.favicon || '')
    setLinkThumbnail(link.thumbnail || '')
    setIsPrivateOnly(false)
    setIsLinkModalOpen(true)
  }

  // Copy url for private mode helper
  const copyToClipboard = (url: string, id: string) => {
    navigator.clipboard.writeText(url)
    setCopiedLinkId(id)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  // Filters & sorts active collection links
  const filteredLinks = activeCollection
    ? activeCollection.links
        .filter(l => {
          const query = linkSearchQuery.toLowerCase()
          return (
            l.title.toLowerCase().includes(query) ||
            (l.description || '').toLowerCase().includes(query) ||
            l.url.toLowerCase().includes(query)
          )
        })
        .sort((a, b) => {
          if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          return a.title.localeCompare(b.title)
        })
    : []

  const filteredCols = collections.filter(c =>
    c.name.toLowerCase().includes(colSearchQuery.toLowerCase())
  )

  return (
    <div className="flex h-[calc(100vh-64px)] lg:h-screen bg-[var(--color-bg-base)] overflow-hidden">
      
      {/* Sidebar - Collections Panel */}
      <aside className={`w-72 shrink-0 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] flex flex-col justify-between transition-transform lg:translate-x-0 ${
        mobileMenuOpen ? 'fixed inset-y-0 left-0 z-40 translate-x-0 pt-16' : 'hidden lg:flex'
      }`}>
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Link Collections</span>
            <button
              onClick={openAddCol}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)] transition-colors cursor-pointer"
              title="Create Collection"
            >
              <FolderPlus size={16} />
            </button>
          </div>

          <div className="p-3 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-slate-400 dark:text-zinc-500" size={14} />
              <input
                type="text"
                placeholder="Search collections..."
                value={colSearchQuery}
                onChange={e => setColSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredCols.map(col => {
              const isActive = col.id === activeCollectionId
              return (
                <div
                  key={col.id}
                  onClick={() => {
                    setActiveCollectionId(col.id)
                    setMobileMenuOpen(false)
                  }}
                  className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                      : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/5 dark:border-white/5"
                      style={{ backgroundColor: col.color }}
                    />
                    <span className="text-xs truncate">{col.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] bg-slate-200/50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-sm font-bold">
                      {col.links.length}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                      <button
                        onClick={e => { e.stopPropagation(); openEditCol(col) }}
                        className="p-0.5 rounded-sm hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-[var(--color-text-main)]"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteCol(col.id) }}
                        className="p-0.5 rounded-sm hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {filteredCols.length === 0 && (
              <p className="text-[10px] text-center text-slate-400 dark:text-zinc-500 py-6 font-bold">No collections found.</p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--color-bg-base)]">
        {activeCollection ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header bar */}
            <header className="px-6 py-4 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="lg:hidden p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)]"
                >
                  <Folder size={14} />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/5"
                    style={{ backgroundColor: activeCollection.color }}
                  />
                  <h1 className="text-sm font-extrabold text-[var(--color-text-main)] truncate">{activeCollection.name}</h1>
                </div>
              </div>

              <button
                onClick={openAddLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-90 transition-opacity cursor-pointer shadow-3xs"
              >
                <Plus size={13} />
                <span>Add URL</span>
              </button>
            </header>

            {/* Filter and Control toolbar */}
            <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]/50 flex flex-col sm:flex-row gap-3 sm:items-center justify-between shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2.5 text-slate-400 dark:text-zinc-500" size={14} />
                <input
                  type="text"
                  placeholder="Search inside this collection..."
                  value={linkSearchQuery}
                  onChange={e => setLinkSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden focus:border-[var(--color-primary)]"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center border border-[var(--color-border)] rounded-md bg-[var(--color-bg-surface)] p-0.5">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1 rounded-sm cursor-pointer ${viewMode === 'grid' ? 'bg-slate-100 dark:bg-zinc-800 text-[var(--color-text-main)]' : 'text-slate-400'}`}
                    title="Grid View"
                  >
                    <Grid size={13} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1 rounded-sm cursor-pointer ${viewMode === 'list' ? 'bg-slate-100 dark:bg-zinc-800 text-[var(--color-text-main)]' : 'text-slate-400'}`}
                    title="List View"
                  >
                    <List size={13} />
                  </button>
                </div>

                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'title')}
                  className="text-xs border border-[var(--color-border)] rounded-md bg-[var(--color-bg-surface)] px-2.5 py-1.5 text-[var(--color-text-main)] focus:outline-hidden"
                >
                  <option value="newest">Newest Added</option>
                  <option value="oldest">Oldest Added</option>
                  <option value="title">Alphabetical (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Links Grid/List area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {filteredLinks.length > 0 ? (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredLinks.map(link => {
                      const host = new URL(link.url).hostname
                      return (
                        <div
                          key={link.id}
                          className="flex flex-col justify-between border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-surface)] overflow-hidden shadow-3xs hover:shadow-xs transition-shadow relative group"
                        >
                          {link.thumbnail && (
                            <div className="relative aspect-video w-full border-b border-[var(--color-border)] overflow-hidden bg-slate-50 dark:bg-zinc-900">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={link.thumbnail}
                                alt={link.title}
                                className="w-full h-full object-cover"
                              />
                              {(link.url.includes('youtube.com') || link.url.includes('youtu.be')) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                  <div className="w-10 h-10 rounded-full bg-rose-600 flex items-center justify-center text-white shadow-md">
                                    <Play size={16} fill="currentColor" className="ml-0.5" />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="p-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                              {link.favicon ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={link.favicon} alt="" className="w-4 h-4 rounded-sm object-contain" />
                              ) : (
                                <Folder size={14} className="text-slate-400" />
                              )}
                              <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider truncate">{host}</span>
                            </div>

                            <h3 className="text-xs font-bold text-[var(--color-text-main)] mb-1 leading-snug line-clamp-2">
                              {link.title}
                            </h3>
                            {link.description && (
                              <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed mb-4">
                                {link.description}
                              </p>
                            )}
                          </div>

                          <div className="px-4 py-3 bg-slate-50/50 dark:bg-zinc-900/40 border-t border-[var(--color-border)] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditLink(link)}
                                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer"
                                title="Edit"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteLink(link.id)}
                                className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-rose-500 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => copyToClipboard(link.url, link.id)}
                                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold border border-[var(--color-border)] rounded-md bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] cursor-pointer"
                                title="Copy URL (Incognito Friendly)"
                              >
                                {copiedLinkId === link.id ? (
                                  <>
                                    <Check size={11} className="text-emerald-500" />
                                    <span className="text-emerald-500">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock size={10} />
                                    <span>Private Copy</span>
                                  </>
                                )}
                              </button>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 cursor-pointer shadow-3xs"
                              >
                                <span>Open</span>
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-surface)] divide-y divide-[var(--color-border)] overflow-hidden shadow-3xs">
                    {filteredLinks.map(link => {
                      const host = new URL(link.url).hostname
                      return (
                        <div key={link.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {link.favicon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={link.favicon} alt="" className="w-5 h-5 rounded-sm object-contain mt-0.5 shrink-0" />
                            ) : (
                              <Folder size={16} className="text-slate-400 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="text-xs font-bold text-[var(--color-text-main)] truncate">{link.title}</h3>
                                <span className="text-[9px] font-extrabold text-slate-400 dark:text-zinc-500 uppercase">{host}</span>
                              </div>
                              <p className="text-[11px] text-[var(--color-text-muted)] truncate max-w-2xl leading-normal">
                                {link.description || link.url}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <button
                              onClick={() => copyToClipboard(link.url, link.id)}
                              className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold border border-[var(--color-border)] rounded-md bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] cursor-pointer"
                              title="Copy URL for Incognito"
                            >
                              {copiedLinkId === link.id ? (
                                <>
                                  <Check size={11} className="text-emerald-500" />
                                  <span className="text-emerald-500">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Lock size={10} />
                                  <span>Private Copy</span>
                                </>
                              )}
                            </button>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 cursor-pointer"
                            >
                              <span>Open</span>
                              <ExternalLink size={10} />
                            </a>
                            <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1 hidden md:block" />
                            <button
                              onClick={() => openEditLink(link)}
                              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteLink(link.id)}
                              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-rose-500 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-zinc-800/85 rounded-lg bg-[var(--color-bg-surface)] p-6">
                  <Folder size={32} className="mx-auto text-slate-400 mb-3" />
                  <h3 className="text-xs font-bold text-[var(--color-text-main)] mb-1">No links saved here</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] max-w-xs mx-auto mb-4 leading-normal">
                    This collection is empty. Add a website, reference document, or video link to populate it.
                  </p>
                  <button
                    onClick={openAddLink}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-90 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add your first link</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex items-center justify-center p-8 bg-[var(--color-bg-surface)]">
            <div className="text-center max-w-md">
              <FolderPlus size={40} className="mx-auto text-[var(--color-primary)] mb-4" />
              <h2 className="text-sm font-black text-[var(--color-text-main)] mb-1 uppercase tracking-wider">Create a Collection</h2>
              <p className="text-xs text-[var(--color-text-muted)] mb-5 leading-relaxed">
                {"Add a group (e.g. 'Work Docs', 'Watch List', 'Research') to start organizing and previewing your links."}
              </p>
              <button
                onClick={openAddCol}
                className="px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-95 shadow-3xs cursor-pointer"
              >
                Create Collection Group
              </button>
            </div>
          </div>
        )}
      </main>

      {/* COLLECTION MODAL (Add/Edit Collection) */}
      {isColModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm animate-fade-in">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">
                {editingCollection ? 'Edit Collection' : 'New Collection'}
              </h2>
              <button onClick={() => setIsColModalOpen(false)} className="text-slate-400 hover:text-[var(--color-text-main)]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Collection Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Travel ideas, Design inspirations"
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-2">Accent Color</label>
                <div className="grid grid-cols-5 gap-2.5">
                  {COLLECTION_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColColor(color)}
                      className={`w-full aspect-square rounded-md border transition-all cursor-pointer relative ${
                        newColColor === color ? 'border-[var(--color-text-main)] scale-105' : 'border-transparent hover:scale-102'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {newColColor === color && (
                        <Check size={11} className="absolute inset-0 m-auto text-white drop-shadow-sm font-bold" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsColModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-bold border border-[var(--color-border)] rounded-md hover:bg-slate-50 dark:hover:bg-zinc-900 text-[var(--color-text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isColLoading}
                  className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-3xs"
                >
                  {isColLoading && <Loader2 size={12} className="animate-spin" />}
                  <span>{editingCollection ? 'Save' : 'Create'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINK MODAL (Add/Edit Saved Link) */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-md animate-fade-in">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">
                {editingLink ? 'Edit Link' : 'Add New Link'}
              </h2>
              <button onClick={() => setIsLinkModalOpen(false)} className="text-slate-400 hover:text-[var(--color-text-main)]">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveLink} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Link URL</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="https://example.com/some-page"
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
                  />
                  {isFetchingMeta && (
                    <div className="absolute right-2.5 top-2.5">
                      <Loader2 size={13} className="animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold mt-1.5">
                  Type or paste URL. Title, summary & thumbnail will auto-fetch in background.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Apple News, Tutorial video"
                  value={linkTitle}
                  onChange={e => setLinkTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Short Summary / Note</label>
                <textarea
                  placeholder="Describe why you saved this link..."
                  rows={2}
                  value={linkDesc}
                  onChange={e => setLinkDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Favicon URL</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={linkFavicon}
                    onChange={e => setLinkFavicon(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Thumbnail Cover URL</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={linkThumbnail}
                    onChange={e => setLinkThumbnail(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="privateOnly"
                    checked={isPrivateOnly}
                    onChange={e => setIsPrivateOnly(e.target.checked)}
                    className="rounded-sm border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] shrink-0"
                  />
                  <label htmlFor="privateOnly" className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 select-none cursor-pointer flex items-center gap-1">
                    <Lock size={10} />
                    <span>Incognito badge suggestion</span>
                  </label>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsLinkModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-bold border border-[var(--color-border)] rounded-md hover:bg-slate-50 dark:hover:bg-zinc-900 text-[var(--color-text-main)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLinkLoading}
                    className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-3xs"
                  >
                    {isLinkLoading && <Loader2 size={12} className="animate-spin" />}
                    <span>{editingLink ? 'Save' : 'Add Link'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
