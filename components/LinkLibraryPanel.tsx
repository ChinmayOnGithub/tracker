"use client"

import React, { useState, useEffect, useRef } from 'react'
import {
  FolderPlus, Grid, List, Folder, Loader2, X,
  ShieldAlert, Plus, Search
} from 'lucide-react'
import {
  deleteLinkCollection, createLink, updateLink, deleteLink,
  togglePinLink, togglePrivateLink, toggleArchiveLink,
  checkDuplicateLink, registerLinkVisit, getLinkTags
} from '@/app/actions/links'

import { ShortcutsHelpModal } from './links/ShortcutsHelpModal'
import { ExportModal } from './links/ExportModal'
import { CollectionModal } from './links/CollectionModal'
import { LinkModal } from './links/LinkModal'
import { LinkCard } from './links/LinkCard'
import { CollectionSidebar } from './links/CollectionSidebar'

export interface LinkTagItem {
  id: string
  name: string
  color: string
}

export interface SavedLink {
  id: string
  collectionId: string
  url: string
  title: string
  description: string | null
  favicon: string | null
  thumbnail: string | null
  accentColor: string | null
  notes: string | null
  isPinned: boolean
  isPrivate: boolean
  isArchived: boolean
  openCount: number
  lastOpenedAt: string | null
  tags: LinkTagItem[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface LinkCollection {
  id: string
  name: string
  color: string
  icon: string | null
  sortOrder: number
  links: SavedLink[]
}

interface LinkLibraryPanelProps {
  initialCollections: LinkCollection[]
}

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

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<SavedLink | null>(null)


  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [privacyNotification, setPrivacyNotification] = useState<{ show: boolean; title: string; url: string } | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Tags list loaded from DB
  const [tagsList, setTagsList] = useState<LinkTagItem[]>([])
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'pinned' | 'archived' | 'private'>('all')

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    exists: boolean
    link?: { id: string; title: string; url: string; collectionId: string; collectionName: string }
  } | null>(null)

  // Drag and drop collection ID
  const [dragOverColId, setDragOverColId] = useState<string | null>(null)

  // Import / Export
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isImportLoading, setIsImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; linksImported: number; collectionsCreated: number } | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)

  // Keyboard Shortcuts Visual Help
  const [kbShortcutsHelpOpen, setKbShortcutsHelpOpen] = useState(false)

  // Instant inline add bar states
  const [instantUrlInput, setInstantUrlInput] = useState('')
  const [isInstantAdding, setIsInstantAdding] = useState(false)
  const instantInputRef = useRef<HTMLInputElement>(null)

  // Active collection helper
  const activeCollection = collections.find(c => c.id === activeCollectionId)

  // Auto-dismiss privacy copy notification toast
  useEffect(() => {
    if (privacyNotification?.show) {
      const timer = setTimeout(() => {
        setPrivacyNotification(null)
      }, 6000)
      return () => clearTimeout(timer)
    }
  }, [privacyNotification])

  // Load UI state from Local Storage on mount
  useEffect(() => {
    const savedColId = localStorage.getItem('tracker_links_collectionId')
    const savedViewMode = localStorage.getItem('tracker_links_viewMode')
    const savedSortBy = localStorage.getItem('tracker_links_sortBy')
    const savedTab = localStorage.getItem('tracker_links_activeTab')

    const timer = setTimeout(() => {
      try {
        if (savedColId && collections.some(c => c.id === savedColId)) {
          setActiveCollectionId(savedColId)
        }
        if (savedViewMode === 'grid' || savedViewMode === 'list') {
          setViewMode(savedViewMode)
        }
        if (savedSortBy === 'newest' || savedSortBy === 'oldest' || savedSortBy === 'title') {
          setSortBy(savedSortBy)
        }
        if (savedTab === 'all' || savedTab === 'pinned' || savedTab === 'archived' || savedTab === 'private') {
          setActiveTab(savedTab)
        }
      } catch (_) {}
    }, 0)

    return () => clearTimeout(timer)
  }, [collections])

  // Save UI state to Local Storage on change
  useEffect(() => {
    try {
      if (activeCollectionId) {
        localStorage.setItem('tracker_links_collectionId', activeCollectionId)
      }
      localStorage.setItem('tracker_links_viewMode', viewMode)
      localStorage.setItem('tracker_links_sortBy', sortBy)
      localStorage.setItem('tracker_links_activeTab', activeTab)
    } catch (_) {}
  }, [activeCollectionId, viewMode, sortBy, activeTab])

  // Fetch Tags List
  useEffect(() => {
    const loadTags = async () => {
      const res = await getLinkTags()
      if (res.success && res.tags) {
        setTagsList(res.tags as LinkTagItem[])
      }
    }
    loadTags()
  }, [collections])

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle help modal: Ctrl + ?
      if (e.ctrlKey && e.key === '?') {
        e.preventDefault()
        setKbShortcutsHelpOpen(prev => !prev)
        return
      }

      // Search focus: Ctrl + K
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.getElementById('linkSearchInput')
        if (searchInput) {
          searchInput.focus()
        }
        return
      }

      // Add URL focus: Ctrl + V
      if (e.ctrlKey && e.key === 'v') {
        const activeEl = document.activeElement
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
        if (!isInput) {
          e.preventDefault()
          if (instantInputRef.current) {
            instantInputRef.current.focus()
          }
        }
        return
      }

      // Handle closing modals
      if (e.key === 'Escape') {
        setIsLinkModalOpen(false)
        setIsColModalOpen(false)
        setIsImportOpen(false)
        setIsExportOpen(false)
        setDuplicateWarning(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLinkModalOpen, isColModalOpen, isImportOpen, isExportOpen])

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
    setIsColModalOpen(true)
  }

  const openEditCol = (col: LinkCollection) => {
    setEditingCollection(col)
    setIsColModalOpen(true)
  }

  // Duplicate Dialog Actions
  const handleOpenExistingDuplicate = () => {
    if (duplicateWarning?.link) {
      setActiveCollectionId(duplicateWarning.link.collectionId)
      setLinkSearchQuery(duplicateWarning.link.title)
      setDuplicateWarning(null)
      setIsLinkModalOpen(false)
      setInstantUrlInput('')
    }
  }

  const handleMoveDuplicate = async () => {
    if (duplicateWarning?.link && activeCollectionId) {
      const res = await updateLink(duplicateWarning.link.id, {
        collectionId: activeCollectionId
      })
      if (res.success && res.link) {
        setCollections(prev => prev.map(c => {
          // Remove from old collection
          if (c.id === duplicateWarning.link!.collectionId) {
            return { ...c, links: c.links.filter(l => l.id !== duplicateWarning.link!.id) }
          }
          // Add to current collection
          if (c.id === activeCollectionId) {
            const created: SavedLink = {
              id: res.link!.id,
              collectionId: activeCollectionId,
              url: res.link!.url,
              title: res.link!.title,
              description: res.link!.description,
              favicon: res.link!.favicon,
              thumbnail: res.link!.thumbnail,
              accentColor: res.link!.accentColor,
              notes: res.link!.notes,
              sortOrder: res.link!.sortOrder,
              isPinned: res.link!.isPinned,
              isPrivate: res.link!.isPrivate,
              isArchived: res.link!.isArchived,
              openCount: res.link!.openCount,
              lastOpenedAt: res.link!.lastOpenedAt ? res.link!.lastOpenedAt.toISOString() : null,
              tags: (res.link!.tags || []).map((t: LinkTagItem) => ({ id: t.id, name: t.name, color: t.color })),
              createdAt: res.link!.createdAt.toISOString(),
              updatedAt: res.link!.updatedAt.toISOString()
            }
            return { ...c, links: [...c.links, created] }
          }
          return c
        }))
        setDuplicateWarning(null)
        setIsLinkModalOpen(false)
        setInstantUrlInput('')
      }
    }
  }

  const handleSaveAnyway = async (instant: boolean = false) => {
    if (!duplicateWarning?.link) return
    
    const payload = {
      url: duplicateWarning.link.url,
      title: duplicateWarning.link.title,
      description: null,
      favicon: null,
      thumbnail: null,
      notes: null,
      tags: [],
      isPrivate: false
    }

    if (instant) {
      setIsInstantAdding(true)
      const res = await createLink(activeCollectionId!, payload)
      if (res.success && res.link) {
        const created: SavedLink = {
          id: res.link.id,
          collectionId: activeCollectionId!,
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
        setCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, links: [...c.links, created] } : c))
        setInstantUrlInput('')
        setDuplicateWarning(null)
      }
      setIsInstantAdding(false)
    }
  }

  const handleDeleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return
    const res = await deleteLink(id)
    if (res.success) {
      setCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, links: c.links.filter(l => l.id !== id) } : c))
    }
  }

  const handleTogglePinLink = async (id: string) => {
    const res = await togglePinLink(id)
    if (res.success && res.link) {
      setCollections(prev => prev.map(c => {
        if (c.id === activeCollectionId) {
          return {
            ...c,
            links: c.links.map(l => l.id === id ? { ...l, isPinned: res.link!.isPinned } : l)
          }
        }
        return c
      }))
    }
  }

  const handleTogglePrivateLink = async (id: string) => {
    const res = await togglePrivateLink(id)
    if (res.success && res.link) {
      setCollections(prev => prev.map(c => {
        if (c.id === activeCollectionId) {
          return {
            ...c,
            links: c.links.map(l => l.id === id ? { ...l, isPrivate: res.link!.isPrivate } : l)
          }
        }
        return c
      }))
    }
  }

  const handleToggleArchiveLink = async (id: string) => {
    const res = await toggleArchiveLink(id)
    if (res.success && res.link) {
      setCollections(prev => prev.map(c => {
        if (c.id === activeCollectionId) {
          return {
            ...c,
            links: c.links.map(l => l.id === id ? { ...l, isArchived: res.link!.isArchived } : l)
          }
        }
        return c
      }))
    }
  }

  const handleOpenLink = (link: SavedLink) => {
    registerLinkVisit(link.id).then(res => {
      if (res.success && res.openCount !== undefined) {
        setCollections(prev => prev.map(c => ({
          ...c,
          links: c.links.map(l => l.id === link.id ? { 
            ...l, 
            openCount: res.openCount!, 
            lastOpenedAt: res.lastOpenedAt ? new Date(res.lastOpenedAt).toISOString() : null 
          } : l)
        })))
      }
    })

    if (link.isPrivate) {
      navigator.clipboard.writeText(link.url)
      setPrivacyNotification({
        show: true,
        title: link.title,
        url: link.url
      })
    } else {
      window.open(link.url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleCopyLink = (link: SavedLink) => {
    navigator.clipboard.writeText(link.url)
    setCopiedLinkId(link.id)
    setTimeout(() => setCopiedLinkId(null), 1500)

    registerLinkVisit(link.id).then(res => {
      if (res.success && res.openCount !== undefined) {
        setCollections(prev => prev.map(c => ({
          ...c,
          links: c.links.map(l => l.id === link.id ? { 
            ...l, 
            openCount: res.openCount!, 
            lastOpenedAt: res.lastOpenedAt ? new Date(res.lastOpenedAt).toISOString() : null 
          } : l)
        })))
      }
    })
  }

  const openEditLink = (link: SavedLink) => {
    setEditingLink(link)
    setDuplicateWarning(null)
    setIsLinkModalOpen(true)
  }

  const handleDragStart = (e: React.DragEvent, linkId: string) => {
    e.dataTransfer.setData('text/plain', linkId)
  }

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault()
    setDragOverColId(colId)
  }

  const handleDragLeave = () => {
    setDragOverColId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetColId: string) => {
    e.preventDefault()
    setDragOverColId(null)
    const linkId = e.dataTransfer.getData('text/plain')
    if (!linkId) return

    let sourceColId = ''
    let linkObj: SavedLink | null = null

    for (const col of collections) {
      const found = col.links.find(l => l.id === linkId)
      if (found) {
        sourceColId = col.id
        linkObj = found
        break
      }
    }

    if (!linkObj || sourceColId === targetColId) return

    const res = await updateLink(linkId, { collectionId: targetColId })
    if (res.success && res.link) {
      setCollections(prev => prev.map(c => {
        if (c.id === sourceColId) {
          return { ...c, links: c.links.filter(l => l.id !== linkId) }
        }
        if (c.id === targetColId) {
          const created: SavedLink = {
            id: res.link!.id,
            collectionId: targetColId,
            url: res.link!.url,
            title: res.link!.title,
            description: res.link!.description,
            favicon: res.link!.favicon,
            thumbnail: res.link!.thumbnail,
            accentColor: res.link!.accentColor,
            notes: res.link!.notes,
            sortOrder: res.link!.sortOrder,
            isPinned: res.link!.isPinned,
            isPrivate: res.link!.isPrivate,
            isArchived: res.link!.isArchived,
            openCount: res.link!.openCount,
            lastOpenedAt: res.link!.lastOpenedAt ? res.link!.lastOpenedAt.toISOString() : null,
            tags: (res.link!.tags || []).map((t: LinkTagItem) => ({ id: t.id, name: t.name, color: t.color })),
            createdAt: res.link!.createdAt.toISOString(),
            updatedAt: res.link!.updatedAt.toISOString()
          }
          return { ...c, links: [...c.links, created] }
        }
        return c
      }))
    }
  }

  const handleImportBookmarks = async (e: React.FormEvent) => {
    e.preventDefault()
    const fileInput = document.getElementById('bookmarksFileInput') as HTMLInputElement
    const file = fileInput?.files?.[0]
    if (!file) return

    setIsImportLoading(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/links/import', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setImportResult({
          success: true,
          linksImported: data.linksImported,
          collectionsCreated: data.collectionsCreated
        })
        
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        alert(data.error || 'Import failed.')
      }
    } catch (err) {
      console.error('Import error:', err)
      alert('Failed to import bookmarks.')
    } finally {
      setIsImportLoading(false)
    }
  }

  const handleRescrapeMetadata = async (link: SavedLink) => {
    try {
      setCollections(prev => prev.map(c => {
        if (c.id === link.collectionId) {
          return {
            ...c,
            links: c.links.map(l => l.id === link.id ? { ...l, title: 'Scraping...' } : l)
          }
        }
        return c
      }))

      const res = await fetch(`/api/metadata?url=${encodeURIComponent(link.url)}`)
      if (res.ok) {
        const scraped = await res.json()
        const updateRes = await updateLink(link.id, {
          title: scraped.title || link.title,
          description: scraped.description || link.description,
          favicon: scraped.favicon || link.favicon,
          thumbnail: scraped.thumbnail || link.thumbnail
        })

        if (updateRes.success && updateRes.link) {
          setCollections(prev => prev.map(c => {
            if (c.id === link.collectionId) {
              return {
                ...c,
                links: c.links.map(l => l.id === link.id ? {
                  ...l,
                  title: updateRes.link!.title,
                  description: updateRes.link!.description,
                  favicon: updateRes.link!.favicon,
                  thumbnail: updateRes.link!.thumbnail
                } : l)
              }
            }
            return c
          }))
        }
      }
    } catch (err) {
      console.error('Failed to rescrape:', err)
    }
  }

  const handleInstantAddLink = async () => {
    const url = instantUrlInput.trim()
    if (!url || !activeCollectionId) return
    setIsInstantAdding(true)

    let finalUrl = url
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl
    }

    // Duplicate detection check
    const dup = await checkDuplicateLink(finalUrl)
    if (dup.exists) {
      setDuplicateWarning({
        exists: true,
        link: dup.link
      })
      setIsInstantAdding(false)
      return
    }

    const payload = {
      url: finalUrl,
      title: '',
      description: null,
      favicon: null,
      thumbnail: null
    }

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
      setCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, links: [...c.links, created] } : c))
      setInstantUrlInput('')
    }
    setIsInstantAdding(false)
  }

  const handleCollectionSaved = (collection: LinkCollection, isNew: boolean) => {
    if (isNew) {
      setCollections(prev => [...prev, collection])
      setActiveCollectionId(collection.id)
    } else {
      setCollections(prev => prev.map(c => c.id === collection.id ? {
        ...c,
        name: collection.name,
        color: collection.color,
        icon: collection.icon
      } : c))
    }
  }

  const handleLinkSaved = (link: SavedLink, isNew: boolean) => {
    if (isNew) {
      setCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, links: [...c.links, link] } : c))
    } else {
      setCollections(prev => prev.map(c => {
        if (c.id === activeCollectionId) {
          return {
            ...c,
            links: c.links.map(l => l.id === link.id ? {
              ...l,
              url: link.url,
              title: link.title,
              description: link.description,
              favicon: link.favicon,
              thumbnail: link.thumbnail,
              notes: link.notes,
              isPrivate: link.isPrivate,
              tags: link.tags
            } : l)
          }
        }
        return c
      }))
    }
  }

  // Filters & sorts active collection links
  const filteredLinks = activeCollection
    ? activeCollection.links
        .filter(l => {
          if (activeTab === 'pinned') return l.isPinned && !l.isArchived
          if (activeTab === 'archived') return l.isArchived
          if (activeTab === 'private') return l.isPrivate && !l.isArchived
          return !l.isArchived
        })
        .filter(l => {
          if (!selectedTagFilter) return true
          return l.tags.some(t => t.name.toLowerCase() === selectedTagFilter.toLowerCase())
        })
        .filter(l => {
          const query = linkSearchQuery.toLowerCase()
          return (
            l.title.toLowerCase().includes(query) ||
            (l.description || '').toLowerCase().includes(query) ||
            (l.notes || '').toLowerCase().includes(query) ||
            l.url.toLowerCase().includes(query) ||
            l.tags.some(t => t.name.toLowerCase().includes(query))
          )
        })
        .sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1
          if (!a.isPinned && b.isPinned) return 1
          if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          return a.title.localeCompare(b.title)
        })
    : []

  return (
    <div className="flex h-[calc(100vh-64px)] lg:h-screen bg-[var(--color-bg-base)] overflow-hidden">
      
      <CollectionSidebar
        collections={collections}
        activeCollectionId={activeCollectionId}
        setActiveCollectionId={setActiveCollectionId}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedTagFilter={selectedTagFilter}
        setSelectedTagFilter={setSelectedTagFilter}
        tagsList={tagsList}
        colSearchQuery={colSearchQuery}
        setColSearchQuery={setColSearchQuery}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        dragOverColId={dragOverColId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenAddCol={openAddCol}
        onOpenEditCol={openEditCol}
        onDeleteCol={handleDeleteCol}
        onOpenShortcutsHelp={() => setKbShortcutsHelpOpen(true)}
      />

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--color-bg-base)]">
        {activeCollection ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header bar */}
            <header className="px-6 py-4 bg-[var(--color-bg-surface)] border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="lg:hidden p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] cursor-pointer"
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
                onClick={() => instantInputRef.current?.focus()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-90 transition-opacity cursor-pointer shadow-3xs"
              >
                <Plus size={13} className="shrink-0" />
                <span>Add URL</span>
              </button>
            </header>

            {/* Filter and Control toolbar */}
            <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]/50 flex flex-col sm:flex-row gap-3 sm:items-center justify-between shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2.5 text-slate-400 dark:text-zinc-555" size={14} />
                <input
                  id="linkSearchInput"
                  type="text"
                  placeholder="Search inside this collection..."
                  value={linkSearchQuery}
                  onChange={e => setLinkSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-[3px] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden focus:border-[var(--color-primary)]"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center border border-[var(--color-border)] rounded-[3px] bg-[var(--color-bg-surface)] p-0.5">
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
                  className="text-xs border border-[var(--color-border)] rounded-[3px] bg-[var(--color-bg-surface)] px-2.5 py-1.5 text-[var(--color-text-main)] focus:outline-hidden"
                >
                  <option value="newest">Newest Added</option>
                  <option value="oldest">Oldest Added</option>
                  <option value="title">Alphabetical (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Inline URL Add Bar */}
            <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] flex gap-2 shrink-0 items-center">
              <div className="relative flex-1">
                <input
                  ref={instantInputRef}
                  type="text"
                  placeholder="Paste any link to save instantly... (e.g. github.com, youtube.com)"
                  value={instantUrlInput}
                  onChange={e => setInstantUrlInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleInstantAddLink()
                    }
                  }}
                  disabled={isInstantAdding}
                  className="w-full px-3.5 py-2 text-xs rounded-[3px] border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden focus:border-[var(--color-primary)] disabled:opacity-70"
                />
                {isInstantAdding && (
                  <div className="absolute right-3 top-2 flex items-center gap-1.5 h-7 text-[10px] text-slate-400 dark:text-zinc-500 font-bold select-none">
                    <Loader2 size={11} className="animate-spin text-[var(--color-primary)] shrink-0" />
                    <span className="shrink-0">Unfurling...</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleInstantAddLink}
                disabled={isInstantAdding || !instantUrlInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-white text-xs font-bold rounded-[3px] hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-3xs shrink-0"
              >
                <span>Save</span>
              </button>
            </div>

            {duplicateWarning && (
              <div className="mx-6 mt-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-[4px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-slide-in shrink-0">
                <div className="flex gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-500 shrink-0">
                    <ShieldAlert size={15} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-500 mb-0.5 uppercase tracking-wide">Already Saved!</h4>
                    <p className="text-[10px] text-slate-600 dark:text-zinc-400 font-semibold leading-relaxed">
                      This link exists in your <span className="underline font-bold">{duplicateWarning.link?.collectionName}</span> collection. What would you like to do?
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleOpenExistingDuplicate}
                    className="px-2.5 py-1.5 bg-slate-800 text-white dark:bg-zinc-800 dark:text-zinc-200 hover:opacity-90 rounded-[3px] text-[10px] font-black cursor-pointer uppercase tracking-wider shadow-3xs"
                  >
                    Open Existing
                  </button>
                  <button
                    onClick={handleMoveDuplicate}
                    className="px-2.5 py-1.5 bg-indigo-600 text-white hover:bg-indigo-500 rounded-[3px] text-[10px] font-black cursor-pointer uppercase tracking-wider shadow-3xs"
                  >
                    Move Here
                  </button>
                  <button
                    onClick={() => handleSaveAnyway(instantUrlInput.length > 0)}
                    className="px-2.5 py-1.5 border border-amber-500/30 text-amber-600 hover:bg-amber-500/5 rounded-[3px] text-[10px] font-black cursor-pointer uppercase tracking-wider"
                  >
                    Save Anyway
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 text-[10px] font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Links Grid/List area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {filteredLinks.length > 0 ? (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 animate-in fade-in duration-200">
                    {filteredLinks.map(link => (
                      <LinkCard
                        key={link.id}
                        link={link}
                        viewMode="grid"
                        copiedLinkId={copiedLinkId}
                        collectionColor={activeCollection.color}
                        onOpenLink={handleOpenLink}
                        onCopyLink={handleCopyLink}
                        onTogglePrivateLink={handleTogglePrivateLink}
                        onToggleArchiveLink={handleToggleArchiveLink}
                        onTogglePinLink={handleTogglePinLink}
                        onOpenEditLink={openEditLink}
                        onDeleteLink={handleDeleteLink}
                        onDragStart={handleDragStart}
                        onSelectTagFilter={setSelectedTagFilter}
                        onRescrapeMetadata={handleRescrapeMetadata}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="border border-[var(--color-border)] rounded-[4px] bg-[var(--color-bg-surface)] divide-y divide-[var(--color-border)] overflow-hidden shadow-3xs animate-in fade-in duration-200">
                    {filteredLinks.map(link => (
                      <LinkCard
                        key={link.id}
                        link={link}
                        viewMode="list"
                        copiedLinkId={copiedLinkId}
                        collectionColor={activeCollection.color}
                        onOpenLink={handleOpenLink}
                        onCopyLink={handleCopyLink}
                        onTogglePrivateLink={handleTogglePrivateLink}
                        onToggleArchiveLink={handleToggleArchiveLink}
                        onTogglePinLink={handleTogglePinLink}
                        onOpenEditLink={openEditLink}
                        onDeleteLink={handleDeleteLink}
                        onDragStart={handleDragStart}
                        onSelectTagFilter={setSelectedTagFilter}
                        onRescrapeMetadata={handleRescrapeMetadata}
                      />
                    ))}
                  </div>
                )
              ) : (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-zinc-800/85 rounded-lg bg-[var(--color-bg-surface)] p-6">
                  <Folder size={32} className="mx-auto text-slate-400 mb-3" />
                  <h3 className="text-xs font-bold text-[var(--color-text-main)] mb-1">No links saved here</h3>
                  <p className="text-[10px] text-[var(--color-text-muted)] max-w-xs mx-auto mb-4 leading-normal">
                    This collection is empty. Paste a link in the input box above to save it automatically.
                  </p>
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

      <CollectionModal
        key={editingCollection?.id || (isColModalOpen ? 'new' : 'closed')}
        isOpen={isColModalOpen}
        onClose={() => setIsColModalOpen(false)}
        editingCollection={editingCollection}
        onSaved={handleCollectionSaved}
      />

      <LinkModal
        key={editingLink?.id || (isLinkModalOpen ? 'new' : 'closed')}
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        editingLink={editingLink}
        activeCollectionId={activeCollectionId || ''}
        tagsList={tagsList}
        onSaved={handleLinkSaved}
        onDuplicateWarning={setDuplicateWarning}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        activeCollectionId={activeCollectionId}
      />

      <ShortcutsHelpModal
        isOpen={kbShortcutsHelpOpen}
        onClose={() => setKbShortcutsHelpOpen(false)}
      />

      {/* IMPORT BOOKMARKS MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-md animate-fade-in">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">Import Bookmarks</h2>
              <button onClick={() => { setIsImportOpen(false); setImportResult(null); }} className="text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleImportBookmarks} className="p-5 space-y-4">
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold leading-relaxed">
                Upload a standard Chrome/Firefox <span className="font-bold underline">bookmarks.html</span> file. 
                Folders will convert to collections, and links will be auto-imported.
              </p>

              <div>
                <input
                  type="file"
                  id="bookmarksFileInput"
                  required
                  accept=".html"
                  className="w-full text-xs text-slate-500 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-[var(--color-accent)] file:text-[var(--color-text-main)] hover:file:opacity-90 file:cursor-pointer"
                />
              </div>

              {importResult && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[10px] text-emerald-600 dark:text-emerald-400 font-bold space-y-1">
                  <p>✓ Bookmarks imported successfully!</p>
                  <p>• {importResult.linksImported} links added.</p>
                  <p>• {importResult.collectionsCreated} collections created.</p>
                  <p className="text-[9px] opacity-75 font-normal">Page will reload shortly...</p>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => { setIsImportOpen(false); setImportResult(null); }}
                  className="px-3.5 py-1.5 text-xs font-bold border border-[var(--color-border)] rounded-md hover:bg-slate-50 dark:hover:bg-zinc-900 text-[var(--color-text-main)] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isImportLoading}
                  className="px-4 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-md hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-3xs"
                >
                  {isImportLoading && <Loader2 size={12} className="animate-spin" />}
                  <span>{isImportLoading ? 'Importing...' : 'Upload'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Privacy Incognito Notification Alert */}
      {privacyNotification && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-in max-w-sm w-full bg-slate-905/95 dark:bg-zinc-950/95 text-white border border-amber-500/35 rounded-lg shadow-xl backdrop-blur-md p-4 flex gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <ShieldAlert size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-black text-amber-500 mb-0.5 uppercase tracking-wide">Incognito Link Copied!</h4>
            <p className="text-[10px] text-slate-300 font-semibold leading-relaxed mb-2">
              &quot;{privacyNotification.title}&quot; was copied to your clipboard. Paste it directly in private browsing.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPrivacyNotification(null)}
                className="px-2.5 py-1 bg-amber-500 text-white rounded text-[9px] font-black cursor-pointer uppercase tracking-wider shadow-3xs"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
