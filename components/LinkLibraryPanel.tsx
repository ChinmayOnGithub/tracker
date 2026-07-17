"use client"

import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, Search, FolderPlus, ExternalLink, Edit2, Trash2,
  Grid, List, Lock, Folder, Play, Check, Loader2, X, Pin,
  Copy, EyeOff, Eye, ShieldAlert, Archive, Download,
  Upload, Tag, Keyboard
} from 'lucide-react'
import {
  createLinkCollection, updateLinkCollection, deleteLinkCollection,
  createLink, updateLink, deleteLink, togglePinLink, togglePrivateLink,
  toggleArchiveLink, checkDuplicateLink, registerLinkVisit, getLinkTags
} from '@/app/actions/links'

interface LinkTagItem {
  id: string
  name: string
  color: string
}

interface SavedLink {
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

interface LinkCollection {
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
  const [newColEmoji, setNewColEmoji] = useState('📁')
  const [isColLoading, setIsColLoading] = useState(false)

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<SavedLink | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkDesc, setLinkDesc] = useState('')
  const [linkNotes, setLinkNotes] = useState('')
  const [linkTags, setLinkTags] = useState<string[]>([]) // Tags being edited for current link
  const [linkTagInput, setLinkTagInput] = useState('')
  const [linkFavicon, setLinkFavicon] = useState('')
  const [linkThumbnail, setLinkThumbnail] = useState('')
  const [isPrivateOnly, setIsPrivateOnly] = useState(true) // Checked by default!

  const [isFetchingMeta, setIsFetchingMeta] = useState(false)
  const [isLinkLoading, setIsLinkLoading] = useState(false)
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

  // Handle Collection CRUD
  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newColName.trim()) return
    setIsColLoading(true)

    if (editingCollection) {
      const res = await updateLinkCollection(editingCollection.id, {
        name: newColName.trim(),
        color: newColColor,
        icon: newColEmoji || null
      })
      if (res.success && res.collection) {
        setCollections(prev => prev.map(c => c.id === editingCollection.id ? { 
          ...c, 
          name: res.collection!.name, 
          color: res.collection!.color,
          icon: res.collection!.icon
        } : c))
        setIsColModalOpen(false)
      }
    } else {
      const res = await createLinkCollection(newColName.trim(), newColColor, newColEmoji)
      if (res.success && res.collection) {
        const newCol: LinkCollection = {
          id: res.collection.id,
          name: res.collection.name,
          color: res.collection.color,
          icon: res.collection.icon,
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
    setNewColEmoji('📁')
    setIsColModalOpen(true)
  }

  const openEditCol = (col: LinkCollection) => {
    setEditingCollection(col)
    setNewColName(col.name)
    setNewColColor(col.color)
    setNewColEmoji(col.icon || '📁')
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
      notes: instant ? null : linkNotes.trim() || null,
      tags: instant ? [] : linkTags,
      isPrivate: instant ? false : isPrivateOnly
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
    } else {
      setIsLinkLoading(true)
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
        setDuplicateWarning(null)
        setIsLinkModalOpen(false)
      }
      setIsLinkLoading(false)
    }
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

    // Duplicate detection check
    if (!editingLink) {
      const dup = await checkDuplicateLink(finalUrl)
      if (dup.exists) {
        setDuplicateWarning({
          exists: true,
          link: dup.link
        })
        setIsLinkLoading(false)
        return
      }
    }

    const payload = {
      url: finalUrl,
      title: linkTitle.trim() || finalUrl,
      description: linkDesc.trim() || null,
      favicon: linkFavicon.trim() || null,
      thumbnail: linkThumbnail.trim() || null,
      isPrivate: isPrivateOnly,
      notes: linkNotes.trim() || null,
      tags: linkTags
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
                thumbnail: res.link!.thumbnail,
                notes: res.link!.notes,
                isPrivate: res.link!.isPrivate,
                tags: (res.link!.tags || []).map((t: LinkTagItem) => ({ id: t.id, name: t.name, color: t.color }))
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
        setIsLinkModalOpen(false)
      }
    }
    setIsLinkLoading(false)
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
    } else {
      alert(res.error || 'Failed to save link. Please check the URL.')
    }
    setIsInstantAdding(false)
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
    // Increment visit count in background
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
    setLinkUrl(link.url)
    setLinkTitle(link.title)
    setLinkDesc(link.description || '')
    setLinkNotes(link.notes || '')
    setLinkTags(link.tags ? link.tags.map(t => t.name) : [])
    setLinkTagInput('')
    setLinkFavicon(link.favicon || '')
    setLinkThumbnail(link.thumbnail || '')
    setIsPrivateOnly(link.isPrivate)
    setDuplicateWarning(null)
    setIsLinkModalOpen(true)
  }

  // Filters & sorts active collection links
  const filteredLinks = activeCollection
    ? activeCollection.links
        .filter(l => {
          // Tab filters
          if (activeTab === 'pinned') return l.isPinned && !l.isArchived
          if (activeTab === 'archived') return l.isArchived
          if (activeTab === 'private') return l.isPrivate && !l.isArchived
          // 'all' is default
          return !l.isArchived
        })
        .filter(l => {
          // Tag filters
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
                  thumbnail: updateRes.link!.thumbnail,
                  accentColor: updateRes.link!.accentColor
                } : l)
              }
            }
            return c
          }))
        }
      } else {
        alert('Failed to scrape metadata. Please check the URL.')
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleRemoveTag = (tagName: string) => {
    setLinkTags(prev => prev.filter(t => t !== tagName))
  }

  const handleAddTag = (tagName: string) => {
    if (!tagName.trim()) return
    const clean = tagName.trim().toLowerCase()
    if (!linkTags.includes(clean)) {
      setLinkTags(prev => [...prev, clean])
    }
    setLinkTagInput('')
  }

  const filteredCols = collections.filter(c =>
    c.name.toLowerCase().includes(colSearchQuery.toLowerCase())
  )

  return (
    <div className="flex h-[calc(100vh-64px)] lg:h-screen bg-[var(--color-bg-base)] overflow-hidden">
      {/* Sidebar - Collections Panel */}
      <aside className={`w-72 shrink-0 bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] flex flex-col justify-between transition-transform lg:translate-x-0 ${
        mobileMenuOpen ? 'fixed inset-y-0 left-0 z-40 translate-x-0 pt-16' : 'hidden lg:flex'
      }`}>
        <div className="flex-grow flex flex-col min-h-0">
          
          {/* Header Bar */}
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Link Library</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsImportOpen(true)}
                className="p-1 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Import HTML Bookmarks"
              >
                <Upload size={13} />
              </button>
              <button
                onClick={() => setIsExportOpen(true)}
                className="p-1 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Export Bookmarks"
              >
                <Download size={13} />
              </button>
              <button
                onClick={openAddCol}
                className="p-1 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-[var(--color-text-main)] transition-colors cursor-pointer"
                title="Create Collection"
              >
                <FolderPlus size={13} />
              </button>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="p-2 border-b border-[var(--color-border)]/50 space-y-0.5 shrink-0">
            <button
              onClick={() => { setActiveTab('all'); setSelectedTagFilter(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
                activeTab === 'all' && !selectedTagFilter
                  ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
              }`}
            >
              <Folder size={12} className="text-slate-400 dark:text-zinc-500" />
              <span>All Bookmarks</span>
            </button>
            <button
              onClick={() => { setActiveTab('pinned'); setSelectedTagFilter(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
                activeTab === 'pinned'
                  ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
              }`}
            >
              <Pin size={12} className="text-amber-500" />
              <span>Pinned</span>
            </button>
            <button
              onClick={() => { setActiveTab('private'); setSelectedTagFilter(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
                activeTab === 'private'
                  ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
              }`}
            >
              <Lock size={12} className="text-indigo-500" />
              <span>Private Lock</span>
            </button>
            <button
              onClick={() => { setActiveTab('archived'); setSelectedTagFilter(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-xs transition-colors text-left cursor-pointer ${
                activeTab === 'archived'
                  ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold'
                  : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
              }`}
            >
              <Archive size={12} className="text-slate-400 dark:text-zinc-500" />
              <span>Archived</span>
            </button>
          </div>

          {/* Collections Title and Search */}
          <div className="p-3 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block mb-2 px-1">Collections</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-slate-400 dark:text-zinc-550" size={12} />
              <input
                type="text"
                placeholder="Search collections..."
                value={colSearchQuery}
                onChange={e => setColSearchQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1 text-[11px] rounded-[3px] border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] placeholder-slate-400 dark:placeholder-zinc-650 focus:outline-hidden focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          {/* Collections List */}
          <div className="overflow-y-auto px-2 space-y-0.5 max-h-48 border-b border-[var(--color-border)]/40 pb-2 shrink-0">
            {filteredCols.map(col => {
              const isActive = col.id === activeCollectionId
              const isDragOver = dragOverColId === col.id
              return (
                <div
                  key={col.id}
                  onClick={() => {
                    setActiveCollectionId(col.id)
                    setMobileMenuOpen(false)
                  }}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={`group flex items-center justify-between px-3 py-1.5 rounded-[3px] cursor-pointer transition-all ${
                    isActive
                      ? 'bg-slate-100 dark:bg-zinc-800/80 text-[var(--color-text-main)] font-semibold border-l-2'
                      : 'text-[var(--color-text-muted)] hover:bg-slate-50 dark:hover:bg-zinc-900/40 hover:text-[var(--color-text-main)]'
                  } ${isDragOver ? 'border-dashed border-2 border-indigo-500 scale-[1.02] bg-indigo-50/10' : ''}`}
                  style={{ borderLeftColor: isActive ? col.color : undefined }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs shrink-0">{col.icon || '📁'}</span>
                    <span className="text-xs truncate">{col.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] bg-slate-200/50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-sm font-bold">
                      {col.links.length}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                      <button
                        onClick={e => { e.stopPropagation(); openEditCol(col) }}
                        className="p-0.5 rounded-sm hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-[var(--color-text-main)]"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteCol(col.id) }}
                        className="p-0.5 rounded-sm hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {filteredCols.length === 0 && (
              <p className="text-[10px] text-center text-slate-400 dark:text-zinc-550 py-4 font-bold">No collections found.</p>
            )}
          </div>

          {/* Tags List */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col min-h-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1 mb-2 px-1 select-none">
              <Tag size={10} />
              <span>Tags</span>
            </span>
            <div className="flex flex-wrap gap-1.5 overflow-y-auto p-0.5 max-h-32">
              {tagsList.map(tag => {
                const isSelected = selectedTagFilter?.toLowerCase() === tag.name.toLowerCase()
                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setSelectedTagFilter(isSelected ? null : tag.name)
                    }}
                    className={`text-[10px] font-bold px-2 py-0.75 rounded-[3px] border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent shadow-3xs'
                        : 'bg-slate-50 text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-300 border-[var(--color-border)] hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    #{tag.name}
                  </button>
                )
              })}
              {tagsList.length === 0 && (
                <span className="text-[9px] text-slate-400 dark:text-zinc-550 font-bold px-1 py-1">No tags defined yet.</span>
              )}
            </div>
          </div>

        </div>

        {/* Keyboard Shortcuts Help Link */}
        <div className="p-3 border-t border-[var(--color-border)]/40 flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500 font-semibold shrink-0">
          <button
            onClick={() => setKbShortcutsHelpOpen(true)}
            className="flex items-center gap-1 hover:text-[var(--color-text-main)] transition-colors cursor-pointer"
          >
            <Keyboard size={12} />
            <span>Keyboard Shortcuts</span>
          </button>
          <span>Ctrl+?</span>
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
                onClick={() => instantInputRef.current?.focus()}
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

            {/* Inline URL Add Bar (Notion/WhatsApp style: paste, hit Enter or click Save, metadata is fetched on the server automatically) */}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredLinks.map(link => {
                      const host = new URL(link.url).hostname
                      return (
                        <div
                          key={link.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, link.id)}
                          className={`flex flex-col justify-between border rounded-[4px] bg-[var(--color-bg-surface)] overflow-hidden hover:shadow-xs hover:-translate-y-0.5 transition-all duration-200 relative group ${
                            link.isPinned
                              ? 'border-amber-400 dark:border-amber-500/50 ring-1 ring-amber-400/10'
                              : 'border-[var(--color-border)]'
                          }`}
                          style={{ borderTop: link.accentColor ? `3px solid ${link.accentColor}` : undefined }}
                        >
                          {/* Private Badge */}
                          {link.isPrivate && (
                            <div className="absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded-[3px] bg-zinc-950/80 text-amber-400 flex items-center gap-1 text-[9px] font-black z-10 select-none shadow-3xs border border-amber-500/20 backdrop-blur-xs">
                              <Lock size={9} />
                              <span>Private</span>
                            </div>
                          )}

                          {/* Pinned Icon Button (Visible on hover, or permanently if pinned) */}
                          <button
                            onClick={() => handleTogglePinLink(link.id)}
                            className={`absolute top-2 right-2 p-1.5 rounded-[3px] backdrop-blur-md shadow-3xs cursor-pointer z-10 transition-all ${
                              link.isPinned
                                ? 'bg-amber-500 text-white opacity-100'
                                : 'bg-white/90 dark:bg-zinc-900/90 text-slate-400 dark:text-zinc-550 opacity-0 group-hover:opacity-100 hover:text-amber-500'
                            }`}
                            title={link.isPinned ? "Unpin Link" : "Pin Link"}
                          >
                            <Pin size={11} fill={link.isPinned ? "currentColor" : "none"} />
                          </button>

                          {/* Thumbnail / cover placeholder */}
                          <div className="relative h-32 w-full border-b border-[var(--color-border)] overflow-hidden bg-slate-50 dark:bg-zinc-900 shrink-0">
                            {link.thumbnail ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={link.thumbnail}
                                  alt={link.title}
                                  className="w-full h-full object-cover"
                                />
                                {(link.url.includes('youtube.com') || link.url.includes('youtu.be')) && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="w-9 h-9 rounded-full bg-rose-600 flex items-center justify-center text-white shadow-md">
                                      <Play size={14} fill="currentColor" className="ml-0.5" />
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div 
                                className="w-full h-full flex items-center justify-center relative overflow-hidden select-none"
                                style={{
                                  background: `linear-gradient(135deg, ${activeCollection.color}15, ${activeCollection.color}05)`,
                                }}
                              >
                                <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] opacity-35" />
                                <div 
                                  className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-xs shadow-3xs border border-black/5"
                                  style={{
                                    backgroundColor: activeCollection.color,
                                    color: '#fff',
                                  }}
                                >
                                  {host.split('.')[0] === 'www' ? host.split('.')[1]?.slice(0, 2).toUpperCase() : host.split('.')[0]?.slice(0, 2).toUpperCase()}
                                </div>
                              </div>
                            )}

                            {/* Failed Metadata Indicator Banner */}
                            {link.title.toLowerCase() === 'link' && (
                              <div className="absolute inset-x-0 bottom-0 bg-black/90 p-1.5 flex items-center justify-between text-[9px] text-white">
                                <span className="font-semibold text-slate-300">Preview failed</span>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleRescrapeMetadata(link); }}
                                  className="px-2 py-0.5 bg-indigo-600 rounded font-black hover:bg-indigo-500 cursor-pointer uppercase tracking-wider text-[8px]"
                                >
                                  Retry
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Card Content */}
                          <div className="p-4 flex-1 flex flex-col justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-2">
                                {link.favicon ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={link.favicon} alt="" className="w-3.5 h-3.5 rounded-sm object-contain" />
                                ) : (
                                  <Folder size={12} className="text-slate-400" />
                                )}
                                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-550 uppercase tracking-wider truncate">{host}</span>
                                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-550 flex items-center gap-0.5 shrink-0">
                                  <span>•</span>
                                  <span>Added {new Date(link.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                </span>
                                {link.openCount > 0 && (
                                  <span className="text-[9px] font-black text-slate-400 dark:text-zinc-550 flex items-center gap-0.5" title={`${link.openCount} views / copies`}>
                                    <span>•</span>
                                    <span>👁️ {link.openCount}</span>
                                  </span>
                                )}
                              </div>

                              <h3 className="text-xs font-black text-[var(--color-text-main)] mb-1 leading-snug line-clamp-2 hover:text-[var(--color-primary)] transition-colors">
                                <span className="cursor-pointer" onClick={() => handleOpenLink(link)}>{link.title}</span>
                              </h3>
                              {link.description && (
                                <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed mb-1.5">
                                  {link.description}
                                </p>
                              )}

                              {/* Personal Notes */}
                              {link.notes && (
                                <div className="mt-2 p-2 rounded bg-amber-500/5 border-l-2 border-amber-400/40 text-[9px] text-slate-600 dark:text-zinc-400 italic leading-normal whitespace-pre-wrap">
                                  {link.notes}
                                </div>
                              )}

                              {/* Tags List */}
                              {link.tags && link.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2.5">
                                  {link.tags.map(t => (
                                    <button
                                      key={t.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedTagFilter(t.name)
                                      }}
                                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] bg-slate-100 text-slate-500 dark:bg-zinc-800/80 dark:text-zinc-400 hover:bg-slate-200 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                                    >
                                      #{t.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Footer Actions */}
                          <div className="px-4 py-2 bg-slate-50/50 dark:bg-zinc-900/20 border-t border-[var(--color-border)] flex items-center justify-between shrink-0">
                            {/* Left Side: Edit, Delete, Archive */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditLink(link)}
                                className="p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer transition-colors"
                                title="Edit Title/Note/Tags"
                              >
                                <Edit2 size={11} />
                              </button>
                              <button
                                onClick={() => handleToggleArchiveLink(link.id)}
                                className={`p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                                  link.isArchived ? 'text-indigo-500 font-bold' : 'text-slate-400 hover:text-indigo-500'
                                }`}
                                title={link.isArchived ? "Unarchive" : "Archive"}
                              >
                                <Archive size={11} />
                              </button>
                              <button
                                onClick={() => handleDeleteLink(link.id)}
                                className="p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>

                            {/* Right Side: Copy, Privacy Toggle, Open */}
                            <div className="flex items-center gap-1.5">
                              {/* Copy Clipboard */}
                              <button
                                onClick={() => handleCopyLink(link)}
                                className="p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer transition-colors"
                                title="Copy link"
                              >
                                {copiedLinkId === link.id ? (
                                  <Check size={11} className="text-emerald-500" />
                                ) : (
                                  <Copy size={11} />
                                )}
                              </button>

                              {/* Toggle Privacy suggestion */}
                              <button
                                onClick={() => handleTogglePrivateLink(link.id)}
                                className={`p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                                  link.isPrivate ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                                }`}
                                title={link.isPrivate ? "Disable Privacy Lock" : "Enable Privacy Lock"}
                              >
                                {link.isPrivate ? <EyeOff size={11} /> : <Eye size={11} />}
                              </button>

                              {/* Open Trigger */}
                              <button
                                onClick={() => handleOpenLink(link)}
                                className="p-1.5 rounded-[3px] bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-3xs"
                                title={link.isPrivate ? "Copy & Alert Incognito" : "Open Link"}
                              >
                                {link.isPrivate ? <Lock size={10} /> : <ExternalLink size={10} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="border border-[var(--color-border)] rounded-[4px] bg-[var(--color-bg-surface)] divide-y divide-[var(--color-border)] overflow-hidden shadow-3xs">
                    {filteredLinks.map(link => {
                      const host = new URL(link.url).hostname
                      return (
                        <div
                          key={link.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, link.id)}
                          className={`p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 group relative transition-colors ${
                            link.isPinned
                              ? 'bg-amber-500/5 dark:bg-amber-500/2 border-l-[3px] border-l-amber-500 pl-3.5'
                              : 'border-l-[3px] border-l-transparent'
                          }`}
                          style={{ borderLeftColor: link.accentColor || undefined }}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {link.favicon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={link.favicon} alt="" className="w-4 h-4 rounded-sm object-contain mt-0.5 shrink-0" />
                            ) : (
                              <Folder size={14} className="text-slate-400 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h3 
                                  onClick={() => handleOpenLink(link)}
                                  className="text-xs font-black text-[var(--color-text-main)] truncate hover:text-[var(--color-primary)] cursor-pointer"
                                >
                                  {link.title}
                                </h3>
                                {link.isPinned && <Pin size={9} className="text-amber-500 fill-amber-500 shrink-0" />}
                                {link.isPrivate && (
                                  <span className="px-1 py-0.25 text-[8px] font-black bg-amber-500/10 text-amber-500 rounded border border-amber-500/20 uppercase">Private</span>
                                )}
                                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-550 uppercase shrink-0">{host}</span>
                                <span className="text-[8px] font-black text-slate-400 dark:text-zinc-550 flex items-center gap-0.5 shrink-0">
                                  <span>•</span>
                                  <span>Added {new Date(link.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                </span>
                                {link.openCount > 0 && (
                                  <span className="text-[8px] font-black text-slate-400 dark:text-zinc-550 flex items-center gap-0.5 shrink-0" title={`${link.openCount} views / copies`}>
                                    <span>•</span>
                                    <span>👁️ {link.openCount}</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[var(--color-text-muted)] truncate max-w-2xl leading-normal mb-1">
                                {link.description || link.url}
                              </p>

                              {/* Personal Notes */}
                              {link.notes && (
                                <p className="text-[9.5px] text-slate-500 dark:text-zinc-450 italic leading-relaxed mb-1">
                                  Notes: {link.notes}
                                </p>
                              )}

                              {/* Tags List */}
                              {link.tags && link.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {link.tags.map(t => (
                                    <button
                                      key={t.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedTagFilter(t.name)
                                      }}
                                      className="text-[8.5px] font-bold px-1.5 py-0.25 rounded-[3px] bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-450 hover:bg-slate-200 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                                    >
                                      #{t.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-1.5 shrink-0">
                            {/* Copy URL */}
                            <button
                              onClick={() => handleCopyLink(link)}
                              className="p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer transition-colors"
                              title="Copy URL"
                            >
                              {copiedLinkId === link.id ? (
                                <Check size={11} className="text-emerald-500" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>

                            {/* Toggle Privacy */}
                            <button
                              onClick={() => handleTogglePrivateLink(link.id)}
                              className={`p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                                  link.isPrivate ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                              }`}
                              title={link.isPrivate ? "Disable Privacy Lock" : "Enable Privacy Lock"}
                            >
                              {link.isPrivate ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>

                            {/* Toggle Archive */}
                            <button
                              onClick={() => handleToggleArchiveLink(link.id)}
                              className={`p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                                link.isArchived ? 'text-indigo-500 font-bold' : 'text-slate-400 hover:text-indigo-500'
                              }`}
                              title={link.isArchived ? "Unarchive" : "Archive"}
                            >
                              <Archive size={11} />
                            </button>

                            {/* Open */}
                            <button
                              onClick={() => handleOpenLink(link)}
                              className="p-1.5 rounded-[3px] bg-[var(--color-primary)] text-white hover:opacity-90 shadow-3xs cursor-pointer"
                              title={link.isPrivate ? "Copy & Alert Incognito" : "Open Link"}
                            >
                              {link.isPrivate ? <Lock size={10} /> : <ExternalLink size={10} />}
                            </button>

                            <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1 hidden md:block" />

                            {/* Pin Toggle */}
                            <button
                              onClick={() => handleTogglePinLink(link.id)}
                              className={`p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                                link.isPinned ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
                              }`}
                              title={link.isPinned ? "Unpin Link" : "Pin Link"}
                            >
                              <Pin size={11} fill={link.isPinned ? "currentColor" : "none"} />
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => openEditLink(link)}
                              className="p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 size={11} />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteLink(link.id)}
                              className="p-1.5 rounded-[3px] hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-rose-500 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={11} />
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
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Collection Icon (Emoji)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['📁', '📚', '🎥', '💼', '💻', '🚀', '🎨', '🧠', '🏠', '🛒', '❤️'].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewColEmoji(emoji)}
                      className={`w-7 h-7 flex items-center justify-center rounded border transition-all text-sm cursor-pointer ${
                        newColEmoji === emoji ? 'border-[var(--color-text-main)] bg-slate-100 dark:bg-zinc-800 scale-110' : 'border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-905'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="Or type any emoji..."
                  value={newColEmoji}
                  onChange={e => setNewColEmoji(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
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
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Apple News, Tutorial video (Autofills if blank)"
                  value={linkTitle}
                  onChange={e => setLinkTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Short Summary (Optional)</label>
                <textarea
                  placeholder="Website description (autofills if blank)..."
                  rows={2}
                  value={linkDesc}
                  onChange={e => setLinkDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)] resize-none mb-3"
                />

                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Personal Notes (Optional)</label>
                <textarea
                  placeholder="Add custom notes, guidelines, or keywords..."
                  rows={2}
                  value={linkNotes}
                  onChange={e => setLinkNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)] resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Tags (Optional)</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {linkTags.map(tag => (
                    <span 
                      key={tag}
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 animate-fade-in"
                    >
                      #{tag}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveTag(tag)}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add tag..."
                    value={linkTagInput}
                    onChange={e => setLinkTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        handleAddTag(linkTagInput)
                      }
                    }}
                    className="flex-grow px-3 py-1.5 text-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg-base)] text-[var(--color-text-main)] focus:outline-hidden focus:border-[var(--color-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(linkTagInput)}
                    className="px-3 py-1.5 border border-[var(--color-border)] text-xs font-bold rounded-md hover:bg-slate-50 dark:hover:bg-zinc-900 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                
                {/* Tag presets/suggestions */}
                {tagsList.length > 0 && (
                  <div className="mt-2.5">
                    <span className="text-[9px] text-slate-400 dark:text-zinc-550 font-bold block mb-1">Click to toggle recent:</span>
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto p-0.5">
                      {tagsList.map(tag => {
                        const hasTag = linkTags.includes(tag.name.toLowerCase())
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

      {/* Floating Privacy Incognito Notification Alert */}
      {privacyNotification && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-in max-w-sm w-full bg-slate-905/95 dark:bg-zinc-950/95 text-white border border-amber-500/35 rounded-lg shadow-xl backdrop-blur-md p-4 flex gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
            <ShieldAlert size={16} />
          </div>
          <div className="flex-grow min-w-0">
            <h4 className="text-xs font-black text-white mb-0.5 uppercase tracking-wide">Incognito Link Copied!</h4>
            <p className="text-[10px] text-slate-300 dark:text-zinc-400 leading-normal mb-2">
              Opening <strong>{privacyNotification.title}</strong> directly from a standard tab leaves a history footprint. We suggest pasting this URL in an Incognito/Private window:
            </p>
            <div className="flex items-center gap-2 bg-black/40 px-2.5 py-1.5 rounded-md border border-white/5 mb-2.5">
              <span className="text-[9px] font-mono text-slate-300 truncate select-all">{privacyNotification.url}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-slate-400 font-semibold">Ctrl+Shift+N or Cmd+Shift+N</span>
              <button 
                onClick={() => setPrivacyNotification(null)}
                className="text-[9px] font-black text-amber-400 hover:text-amber-300 cursor-pointer uppercase tracking-wider"
              >
                Got it
              </button>
            </div>
          </div>
          <button 
            onClick={() => setPrivacyNotification(null)}
            className="text-slate-400 hover:text-white shrink-0 self-start p-0.5 cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* IMPORT MODAL */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm animate-fade-in">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">Import Bookmarks</h2>
              <button onClick={() => { setIsImportOpen(false); setImportResult(null); }} className="text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleImportBookmarks} className="p-5 space-y-4">
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold leading-relaxed">
                Upload a standard HTML bookmarks backup file (exported from Chrome, Safari, Firefox, or Tracker).
              </p>
              <div>
                <input
                  id="bookmarksFileInput"
                  type="file"
                  accept=".html"
                  required
                  className="w-full text-xs text-slate-500 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-55 file:text-indigo-600 dark:file:bg-zinc-800 dark:file:text-zinc-200 file:cursor-pointer"
                />
              </div>
              {importResult && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-650 dark:text-emerald-455 rounded-lg text-xs font-bold space-y-0.5 animate-slide-in">
                  <div>✓ Import successful!</div>
                  <div className="text-[10px] opacity-90">Links Imported: {importResult.linksImported}</div>
                  <div className="text-[10px] opacity-90">Collections Created: {importResult.collectionsCreated}</div>
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

      {/* EXPORT MODAL */}
      {isExportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm animate-fade-in">
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">Export Bookmarks</h2>
              <button onClick={() => setIsExportOpen(false)} className="text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold leading-relaxed">
                Choose a format to export your link library. You can import Netscape HTML back into Chrome/Firefox or another Tracker instance.
              </p>
              <div className="grid grid-cols-1 gap-2">
                <a
                  href={`/api/links/export?format=html${activeCollectionId ? `&collectionId=${activeCollectionId}` : ''}`}
                  download
                  onClick={() => setIsExportOpen(false)}
                  className="w-full flex items-center justify-between p-3 border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-900 rounded-lg text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider cursor-pointer shadow-3xs"
                >
                  <span>HTML (Netscape/Chrome)</span>
                  <Download size={14} className="text-indigo-500" />
                </a>
                <a
                  href={`/api/links/export?format=json${activeCollectionId ? `&collectionId=${activeCollectionId}` : ''}`}
                  download
                  onClick={() => setIsExportOpen(false)}
                  className="w-full flex items-center justify-between p-3 border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-900 rounded-lg text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider cursor-pointer shadow-3xs"
                >
                  <span>JSON Backup</span>
                  <Download size={14} className="text-indigo-500" />
                </a>
                <a
                  href={`/api/links/export?format=csv${activeCollectionId ? `&collectionId=${activeCollectionId}` : ''}`}
                  download
                  onClick={() => setIsExportOpen(false)}
                  className="w-full flex items-center justify-between p-3 border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-zinc-900 rounded-lg text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider cursor-pointer shadow-3xs"
                >
                  <span>CSV Spreadsheet</span>
                  <Download size={14} className="text-indigo-500" />
                </a>
              </div>
              <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-end">
                <button
                  onClick={() => setIsExportOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-bold border border-[var(--color-border)] rounded-md hover:bg-slate-50 dark:hover:bg-zinc-900 text-[var(--color-text-main)] cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HELP DIALOG */}
      {kbShortcutsHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg shadow-xl w-full max-w-sm animate-fade-in p-5">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3 mb-4">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)] flex items-center gap-1.5">
                <Keyboard size={14} />
                <span>Keyboard Shortcuts</span>
              </h2>
              <button onClick={() => setKbShortcutsHelpOpen(false)} className="text-slate-400 hover:text-[var(--color-text-main)] cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-[var(--color-border)]/30 pb-2">
                <span className="font-bold text-[var(--color-text-muted)]">Focus Search Bar</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Ctrl + K</kbd>
              </div>
              <div className="flex items-center justify-between text-xs border-b border-[var(--color-border)]/30 pb-2">
                <span className="font-bold text-[var(--color-text-muted)]">Focus Add Link Input</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Ctrl + V</kbd>
              </div>
              <div className="flex items-center justify-between text-xs border-b border-[var(--color-border)]/30 pb-2">
                <span className="font-bold text-[var(--color-text-muted)]">Toggle Shortcuts List</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Ctrl + ?</kbd>
              </div>
              <div className="flex items-center justify-between text-xs pb-1">
                <span className="font-bold text-[var(--color-text-muted)]">Dismiss Modals / Warnings</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-zinc-800 text-[9px] font-mono shadow-3xs">Esc</kbd>
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-[var(--color-border)] flex justify-end">
              <button
                onClick={() => setKbShortcutsHelpOpen(false)}
                className="px-3.5 py-1.5 text-xs font-bold bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 cursor-pointer shadow-3xs"
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
