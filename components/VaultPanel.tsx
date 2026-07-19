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
import { Modal, Input, Button, Card, EmptyState, SkeletonWidget, SearchInput } from '@/design-system'

// ─── File Type Helpers (use mimeGroup from DB — no decryption needed) ─────────

function getFileIcon(mimeGroup: string | null, isFolder: boolean) {
  if (isFolder) return Folder
  switch (mimeGroup) {
    case 'IMAGE': return FileImage
    case 'VIDEO': return FileVideo
    case 'ARCHIVE': return FileArchive
    case 'PDF': return FileText
    case 'TEXT': return FileText
    case 'SPREADSHEET': return FileSpreadsheet
    case 'CODE': return FileCode
    default: return File
  }
}

function getFileColor(mimeGroup: string | null, isFolder: boolean): string {
  if (isFolder) return 'text-amber-500'
  switch (mimeGroup) {
    case 'IMAGE': return 'text-pink-500'
    case 'VIDEO': return 'text-purple-500'
    case 'PDF': return 'text-red-500'
    case 'ARCHIVE': return 'text-orange-500'
    case 'SPREADSHEET': return 'text-emerald-500'
    case 'TEXT': return 'text-blue-500'
    case 'CODE': return 'text-cyan-500'
    default: return 'text-[var(--color-text-muted)]'
  }
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
    setLoading(true);
    setErrorMessage(null);
    try {
      const [itemsResult, breadcrumbsResult, statsResult] = await Promise.all([
        listVaultItems(currentFolderId),
        getVaultBreadcrumbs(currentFolderId),
        getVaultStats(),
      ]);
      if (itemsResult.success) {
        setItems(itemsResult.items);
      } else {
        setErrorMessage(itemsResult.error || 'Failed to load items');
      }
      if (breadcrumbsResult.success) setBreadcrumbs(breadcrumbsResult.breadcrumbs);
      if (statsResult.success) setStats(statsResult.stats);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to retrieve vault data');
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchItems]);

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
    const errors: string[] = []

    for (const file of fileArray) {
      setUploadProgress(`Uploading ${file.name} (${completed + 1}/${fileArray.length})`)
      
      // Client-side validation
      if (file.size === 0) {
        errors.push(`${file.name}: File is empty`)
        continue
      }
      
      if (file.size > 50 * 1024 * 1024) {
        errors.push(`${file.name}: File too large (max 50MB)`)
        continue
      }

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
          errors.push(`${file.name}: ${result.error || 'Upload failed'}`)
          continue
        }
        completed++
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Network error'}`)
        continue
      }
    }

    setUploading(false)
    setUploadProgress(null)
    
    if (errors.length > 0) {
      setErrorMessage(`${errors.length} file(s) failed: ${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}`)
    }
    
    if (completed > 0) {
      fetchItems()
    }
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
    
    try {
      const link = document.createElement('a')
      link.href = `/api/vault/download/${item.id}`
      link.download = item.name
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      
      // Cleanup after a short delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(link)
      }, 100)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to initiate download')
    }
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
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[var(--color-text-main)] tracking-tight leading-tight">Secure Vault</h1>
            <p className="text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-2 mt-0.5">
              <HardDrive className="w-3.5 h-3.5" />
              {stats.totalFiles} files · {stats.totalFolders} folders · {formatFileSize(stats.totalSize)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowNewFolder(true); setNewFolderName('') }}
            icon={<FolderPlus className="w-4 h-4" />}
          >
            <span className="hidden sm:inline">New Folder</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            isLoading={uploading}
            icon={!uploading ? <Upload className="w-4 h-4" /> : undefined}
          >
            <span className="hidden sm:inline">{uploading ? 'Uploading…' : 'Upload'}</span>
          </Button>
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
        <div className="bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-[var(--radius-md)] px-3 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin shrink-0" />
          <span className="text-sm font-semibold text-[var(--color-primary)]">{uploadProgress}</span>
        </div>
      )}

      {/* ─── Error Notification ────────────────────────────────────── */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[var(--radius-md)] px-3 py-2 flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-0.5 rounded-[var(--radius-sm)] hover:bg-rose-500/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Breadcrumbs - Responsive with truncation ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 text-sm font-medium overflow-x-auto pb-0.5 scrollbar-thin">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.id ?? 'root'}>
            {index > 0 && <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]/50 shrink-0" />}
            <button
              onClick={() => navigateToFolder(crumb.id)}
              className={`shrink-0 px-2 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
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
        <SearchInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search files and folders…"
        />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <SkeletonWidget />
          <SkeletonWidget />
          <SkeletonWidget />
          <SkeletonWidget />
        </div>
      ) : filteredItems.length === 0 ? (
        /* ─── Empty State ──────────────────────────────────────────── */
        <div onClick={() => !searchQuery && fileInputRef.current?.click()}>
          <EmptyState
            title={searchQuery ? 'No results found' : 'This folder is empty'}
            description={searchQuery ? 'Try a different search query' : 'Drag and drop files here, or click to upload'}
            icon={<Upload className="w-6 h-6" />}
            action={
              !searchQuery ? (
                <div className="flex flex-col items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                    icon={<Upload className="w-4 h-4" />}
                  >
                    Upload Files
                  </Button>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <Shield className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">AES-256-GCM Encrypted</span>
                  </div>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        /* ─── File Grid ────────────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredItems.map(item => {
            const IconComponent = getFileIcon(item.mimeGroup, item.isFolder)
            const iconColor = getFileColor(item.mimeGroup, item.isFolder)

            return (
              <Card
                key={item.id}
                interactive={item.isFolder}
                compact
                onDoubleClick={() => handleDoubleClick(item)}
                className="group relative"
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 ${
                    item.isFolder ? 'bg-amber-500/10' : 'bg-[var(--color-accent)]'
                  }`}>
                    <IconComponent className={`w-5 h-5 ${iconColor}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text-main)] truncate leading-tight">
                      {item.name}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {item.isFolder ? 'Folder' : formatFileSize(item.fileSize)}
                      <span className="mx-1.5">·</span>
                      {formatDate(item.createdAt)}
                    </p>
                  </div>

                  {/* Actions - Always visible on mobile, hover on desktop */}
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {!item.isFolder && (
                      <button
                        onClick={e => { e.stopPropagation(); handleDownload(item) }}
                        className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors cursor-pointer"
                        title="Download"
                        aria-label="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setRenamingItem(item); setRenameValue(item.name) }}
                      className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-amber-500/10 hover:text-amber-500 transition-colors cursor-pointer"
                      title="Rename"
                      aria-label="Rename"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeletingItem(item) }}
                      className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Encryption Badge (footer) ─────────────────────────────── */}
      {filteredItems.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">
            All files encrypted with AES-256-GCM · {formatFileSize(stats.totalSize)} stored
          </span>
        </div>
      )}

      {/* ─── New Folder Modal ──────────────────────────────────────── */}
      <Modal
        isOpen={showNewFolder}
        onClose={() => setShowNewFolder(false)}
        title="New Folder"
        size="sm"
      >
        <div className="space-y-4 pt-1">
          <Input
            type="text"
            placeholder="Folder name"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newFolderName.trim()) handleCreateFolder() }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewFolder(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              isLoading={actionLoading}
              icon={<Check className="w-4 h-4" />}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Rename Modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={!!renamingItem}
        onClose={() => setRenamingItem(null)}
        title="Rename"
        size="sm"
      >
        {renamingItem && (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-[var(--color-text-muted)] mb-2">Rename &ldquo;{renamingItem.name}&rdquo;</p>
            <Input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && renameValue.trim()) handleRename() }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRenamingItem(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRename}
                disabled={!renameValue.trim()}
                isLoading={actionLoading}
                icon={<Check className="w-4 h-4" />}
              >
                Rename
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Delete Confirmation Modal ─────────────────────────────── */}
      <Modal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        title={`Delete ${deletingItem?.isFolder ? 'Folder' : 'File'}`}
        size="sm"
      >
        {deletingItem && (
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                  Are you sure you want to permanently delete <span className="font-bold text-[var(--color-text-main)]">&ldquo;{deletingItem.name}&rdquo;</span>?
                </p>
                {deletingItem.isFolder && (
                  <p className="text-xs text-rose-500 font-semibold mt-2">
                    All files and subfolders inside will also be deleted.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingItem(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                isLoading={actionLoading}
                icon={<Trash2 className="w-4 h-4" />}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
