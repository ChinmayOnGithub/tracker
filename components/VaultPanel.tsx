'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File,
  Upload,
  FolderPlus,
  Download,
  Trash2,
  Pencil,
  ChevronRight,
  Shield,
  HardDrive,
  Search,
  ArrowUpDown,
  X,
  Check,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import {
  listVaultItems,
  createVaultFolder,
  renameVaultItem,
  deleteVaultItem,
  getVaultBreadcrumbs,
  getVaultStats,
} from '@/app/actions/vault'
import type { VaultItem, VaultBreadcrumb } from '@/app/actions/vault'

// ─── File Type Helpers ────────────────────────────────────────────────────────

function getFileIcon(mimeType: string | null, isFolder: boolean) {
  if (isFolder) return Folder

  if (!mimeType) return File

  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return FileVideo
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || mimeType.includes('7z') || mimeType.includes('gzip') || mimeType.includes('compress')) return FileArchive
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('msword') || mimeType.includes('text/plain')) return FileText
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return FileSpreadsheet
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('css') || mimeType.includes('typescript') || mimeType.includes('python') || mimeType.includes('java')) return FileCode

  return File
}

function getFileColor(mimeType: string | null, isFolder: boolean): string {
  if (isFolder) return 'text-amber-500'
  if (!mimeType) return 'text-[var(--color-text-muted)]'

  if (mimeType.startsWith('image/')) return 'text-pink-500'
  if (mimeType.startsWith('video/')) return 'text-purple-500'
  if (mimeType.startsWith('audio/')) return 'text-violet-500'
  if (mimeType.includes('pdf')) return 'text-red-500'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return 'text-orange-500'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'text-emerald-500'
  if (mimeType.includes('document') || mimeType.includes('msword') || mimeType.includes('text/plain')) return 'text-blue-500'
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('html')) return 'text-cyan-500'

  return 'text-[var(--color-text-muted)]'
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

type SortField = 'name' | 'date' | 'size'
type SortDir = 'asc' | 'desc'

// ─── Main Component ───────────────────────────────────────────────────────────

export function VaultPanel() {
  // ─── State ────────────────────────────────────────────────────────
  const [items, setItems] = useState<VaultItem[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<VaultBreadcrumb[]>([{ id: null, name: 'Vault' }])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [stats, setStats] = useState({ totalFiles: 0, totalFolders: 0, totalSize: 0 })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Modal states
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingItem, setRenamingItem] = useState<VaultItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingItem, setDeletingItem] = useState<VaultItem | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Drag state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Data Fetching ────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const [itemsResult, breadcrumbsResult, statsResult] = await Promise.all([
        listVaultItems(currentFolderId),
        getVaultBreadcrumbs(currentFolderId),
        getVaultStats(),
      ])
      if (itemsResult.success) {
        setItems(itemsResult.items)
      } else {
        setErrorMessage(itemsResult.error || 'Failed to load items')
      }
      if (breadcrumbsResult.success) setBreadcrumbs(breadcrumbsResult.breadcrumbs)
      if (statsResult.success) setStats(statsResult.stats)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to retrieve vault data')
    } finally {
      setLoading(false)
    }
  }, [currentFolderId])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchItems])

  // ─── Navigation ───────────────────────────────────────────────────

  const navigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId)
    setSearchQuery('')
    setErrorMessage(null)
  }, [])

  const handleDoubleClick = useCallback((item: VaultItem) => {
    if (item.isFolder) {
      navigateToFolder(item.id)
    }
  }, [navigateToFolder])

  // ─── Upload ───────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    setErrorMessage(null)
    let completed = 0

    for (const file of fileArray) {
      setUploadProgress(`Uploading ${file.name} (${completed + 1}/${fileArray.length})`)
      const formData = new FormData()
      formData.append('file', file)
      if (currentFolderId) formData.append('parentId', currentFolderId)

      try {
        const response = await fetch('/api/vault/upload', {
          method: 'POST',
          body: formData,
        })
        const result = await response.json()
        if (!response.ok) {
          setErrorMessage(result.error || `Failed to upload ${file.name}`)
          break
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : `Network error uploading ${file.name}`)
        break
      }
      completed++
    }

    setUploading(false)
    setUploadProgress(null)
    fetchItems()
  }, [currentFolderId, fetchItems])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(e.target.files)
      e.target.value = ''
    }
  }, [uploadFiles])

  // ─── Drag & Drop ──────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }, [uploadFiles])

  // ─── Folder Creation ──────────────────────────────────────────────

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return
    setActionLoading(true)
    setErrorMessage(null)
    try {
      const res = await createVaultFolder(newFolderName.trim(), currentFolderId)
      if (res.success) {
        setNewFolderName('')
        setShowNewFolder(false)
        fetchItems()
      } else {
        setErrorMessage(res.error || 'Failed to create folder')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error creating folder')
    } finally {
      setActionLoading(false)
    }
  }, [newFolderName, currentFolderId, fetchItems])

  // ─── Rename ───────────────────────────────────────────────────────

  const handleRename = useCallback(async () => {
    if (!renamingItem || !renameValue.trim()) return
    setActionLoading(true)
    setErrorMessage(null)
    try {
      const res = await renameVaultItem(renamingItem.id, renameValue.trim())
      if (res.success) {
        setRenamingItem(null)
        setRenameValue('')
        fetchItems()
      } else {
        setErrorMessage(res.error || 'Failed to rename item')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error renaming item')
    } finally {
      setActionLoading(false)
    }
  }, [renamingItem, renameValue, fetchItems])

  // ─── Delete ───────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!deletingItem) return
    setActionLoading(true)
    setErrorMessage(null)
    try {
      const res = await deleteVaultItem(deletingItem.id)
      if (res.success) {
        setDeletingItem(null)
        fetchItems()
      } else {
        setErrorMessage(res.error || 'Failed to delete item')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error deleting item')
    } finally {
      setActionLoading(false)
    }
  }, [deletingItem, fetchItems])

  // ─── Download ─────────────────────────────────────────────────────

  const handleDownload = useCallback((item: VaultItem) => {
    if (item.isFolder) return
    setErrorMessage(null)
    const link = document.createElement('a')
    link.href = `/api/vault/download/${item.id}`
    link.download = item.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  // ─── Filter & Sort ────────────────────────────────────────────────

  const filteredItems = items
    .filter(item => {
      if (!searchQuery) return true
      return item.name.toLowerCase().includes(searchQuery.toLowerCase())
    })
    .sort((a, b) => {
      // Folders always first
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1

      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'date':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'size':
          cmp = (a.fileSize || 0) - (b.fileSize || 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div
      className="space-y-5 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* ─── Drag Overlay ──────────────────────────────────────────── */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-[var(--color-primary)]/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-[var(--color-bg-surface)] border-2 border-dashed border-[var(--color-primary)] rounded-[var(--radius-lg)] p-12 text-center shadow-2xl">
            <Upload className="w-12 h-12 text-[var(--color-primary)] mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--color-text-main)]">Drop files to upload</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Files will be encrypted and stored securely</p>
          </div>
        </div>
      )}

      {/* ─── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Shield className="w-4.5 h-4.5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[var(--color-text-main)] tracking-tight leading-tight">Secure Vault</h1>
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)] flex items-center gap-1.5 mt-0.5">
              <HardDrive className="w-3 h-3" />
              {stats.totalFiles} files · {stats.totalFolders} folders · {formatFileSize(stats.totalSize)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowNewFolder(true); setNewFolderName('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[var(--color-text-main)] bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Folder</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[var(--color-primary)] rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{uploading ? 'Uploading…' : 'Upload'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
        </div>
      </div>

      {/* ─── Upload Progress ───────────────────────────────────────── */}
      {uploadProgress && (
        <div className="bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-[var(--radius-sm)] px-3 py-2 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-[var(--color-primary)] animate-spin shrink-0" />
          <span className="text-xs font-semibold text-[var(--color-primary)]">{uploadProgress}</span>
        </div>
      )}

      {/* ─── Error Notification ────────────────────────────────────── */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[var(--radius-sm)] px-3 py-2 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-0.5 rounded-[var(--radius-sm)] hover:bg-rose-500/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Breadcrumbs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 text-xs font-medium overflow-x-auto pb-0.5">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.id ?? 'root'}>
            {index > 0 && <ChevronRight className="w-3 h-3 text-[var(--color-text-muted)]/50 shrink-0" />}
            <button
              onClick={() => navigateToFolder(crumb.id)}
              className={`shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                index === breadcrumbs.length - 1
                  ? 'text-[var(--color-text-main)] font-bold'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)]'
              }`}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* ─── Search & Sort Bar ─────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search files and folders…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)]/50 focus:outline-none focus:border-[var(--color-primary)] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center border border-[var(--color-border)] rounded-[var(--radius-sm)] overflow-hidden">
          {(['name', 'date', 'size'] as SortField[]).map(field => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${
                sortField === field
                  ? 'bg-[var(--color-accent)] text-[var(--color-text-main)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]/50'
              }`}
            >
              {field}
              {sortField === field && (
                <ArrowUpDown className="w-2.5 h-2.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Content ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[var(--color-primary)] animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        /* ─── Empty State ──────────────────────────────────────────── */
        <div
          className="flex flex-col items-center justify-center py-16 border border-dashed border-[var(--color-border)]/60 rounded-[var(--radius-lg)] bg-gradient-to-b from-[var(--color-bg-surface)] to-transparent cursor-pointer hover:border-[var(--color-primary)]/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--color-accent)] flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-[var(--color-text-muted)]" />
          </div>
          <p className="text-sm font-bold text-[var(--color-text-main)] mb-1">
            {searchQuery ? 'No results found' : 'This folder is empty'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {searchQuery ? 'Try a different search query' : 'Drag and drop files here, or click to upload'}
          </p>
          <div className="flex items-center gap-1 mt-3 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <Shield className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">AES-256-GCM Encrypted</span>
          </div>
        </div>
      ) : (
        /* ─── File Grid ────────────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {filteredItems.map(item => {
            const IconComponent = getFileIcon(item.mimeType, item.isFolder)
            const iconColor = getFileColor(item.mimeType, item.isFolder)

            return (
              <div
                key={item.id}
                onDoubleClick={() => handleDoubleClick(item)}
                className={`group relative flex items-center gap-3 p-3 bg-[var(--color-bg-surface)] border border-[var(--color-border)]/60 rounded-[var(--radius-md)] hover:border-[var(--color-border)] hover:bg-[var(--color-accent)]/30 transition-all cursor-pointer ${
                  item.isFolder ? 'hover:shadow-sm' : ''
                }`}
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 ${
                  item.isFolder ? 'bg-amber-500/10' : 'bg-[var(--color-accent)]'
                }`}>
                  <IconComponent className={`w-4.5 h-4.5 ${iconColor}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--color-text-main)] truncate leading-tight">
                    {item.name}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    {item.isFolder ? 'Folder' : formatFileSize(item.fileSize)}
                    <span className="mx-1">·</span>
                    {formatDate(item.createdAt)}
                  </p>
                </div>

                {/* Actions (shown on hover) */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!item.isFolder && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDownload(item) }}
                      className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setRenamingItem(item); setRenameValue(item.name) }}
                    className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-amber-500/10 hover:text-amber-500 transition-colors cursor-pointer"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeletingItem(item) }}
                    className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Encryption Badge (footer) ─────────────────────────────── */}
      {filteredItems.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <Shield className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">
            All files encrypted with AES-256-GCM · {formatFileSize(stats.totalSize)} stored
          </span>
        </div>
      )}

      {/* ─── New Folder Modal ──────────────────────────────────────── */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewFolder(false)}>
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black text-[var(--color-text-main)] mb-4">New Folder</h3>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder() }}
              autoFocus
              className="w-full px-3 py-2 text-xs bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-text-main)] placeholder:text-[var(--color-text-muted)]/50 focus:outline-none focus:border-[var(--color-primary)] transition-colors mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewFolder(false)}
                className="px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[var(--color-primary)] rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rename Modal ──────────────────────────────────────────── */}
      {renamingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setRenamingItem(null)}>
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black text-[var(--color-text-main)] mb-1">Rename</h3>
            <p className="text-[10px] text-[var(--color-text-muted)] mb-4">Rename &ldquo;{renamingItem.name}&rdquo;</p>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
              autoFocus
              className="w-full px-3 py-2 text-xs bg-[var(--color-bg-base)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-primary)] transition-colors mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenamingItem(null)}
                className="px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!renameValue.trim() || actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[var(--color-primary)] rounded-[var(--radius-sm)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─────────────────────────────── */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDeletingItem(null)}>
          <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <h3 className="text-sm font-black text-[var(--color-text-main)]">Delete {deletingItem.isFolder ? 'Folder' : 'File'}</h3>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1 leading-relaxed">
              Are you sure you want to permanently delete <span className="font-bold text-[var(--color-text-main)]">&ldquo;{deletingItem.name}&rdquo;</span>?
            </p>
            {deletingItem.isFolder && (
              <p className="text-[10px] text-rose-500 font-semibold mb-4">
                All files and subfolders inside will also be deleted.
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-500 rounded-[var(--radius-sm)] hover:bg-rose-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
