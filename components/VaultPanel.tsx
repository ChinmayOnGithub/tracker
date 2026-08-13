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
  Download,
  Trash2,
  Pencil,
  ChevronRight,
  Shield,
  HardDrive as _HardDrive,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Settings
} from 'lucide-react'
import {
  listVaultItems,
  createVaultFolder,
  renameVaultItem,
  deleteVaultItem,
  getVaultBreadcrumbs,
  getVaultStats,
  getVaultDashboardData,
  getVaultSecretValue,
  saveVaultQuickInfoField,
  deleteVaultQuickInfoField,
  saveVaultQuickActions,
  toggleVaultPin,
  setVaultSpecialAsset,
  logVaultAuditAction,
  updateVaultItemCategory
} from '@/app/actions/vault'
import type { VaultItem, VaultBreadcrumb, QuickInfoFieldDTO } from '@/app/actions/vault'
import { Modal, Input, Button, Card, EmptyState, SkeletonWidget, SearchInput } from '@/design-system'
import { useToast } from '@/design-system'
import { writeQueue } from '@/lib/store/write-queue'

// --- File Type & Layout Helpers --------------------------------------------------

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
  if (bytes === null || bytes === 0) return 'â€”'
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
type InfoCategory = 'IDENTITY' | 'BANKING' | 'PERSONAL' | 'OTHER'

async function decryptBufferClientSide(
  encryptedArrayBuffer: ArrayBuffer,
  keyHex: string,
  ivHex: string,
  tagHex: string
): Promise<ArrayBuffer> {
  const rawKey = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const tag = new Uint8Array(tagHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

  const combined = new Uint8Array(encryptedArrayBuffer.byteLength + tag.byteLength);
  combined.set(new Uint8Array(encryptedArrayBuffer), 0);
  combined.set(tag, encryptedArrayBuffer.byteLength);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    combined
  );

  return decrypted;
}

// --- Main Component -----------------------------------------------------------

export function VaultPanel() {
  const { toast } = useToast()

  // --- State --------------------------------------------------------
  const [vaultKey, setVaultKey] = useState<string | null>(null)
  const [items, setItems] = useState<VaultItem[]>([])
  const [_breadcrumbs, setBreadcrumbs] = useState<VaultBreadcrumb[]>([{ id: null, name: 'Vault' }])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [_stats, setStats] = useState({ totalFiles: 0, totalFolders: 0, totalSize: 0 })
  const [loading, setLoading] = useState(true)
  const [_uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [_sortField, _setSortField] = useState<SortField>('name')
  const [_sortDir, _setSortDir] = useState<SortDir>('asc')
  const [_docCategoryFilter, _setDocCategoryFilter] = useState<string>('All')

  // Category navigation
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All')

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [uploadDocName, setUploadDocName] = useState('')
  const [uploadCategory, setUploadCategory] = useState<string>('Identity')
  const [uploadSubCategory, setUploadSubCategory] = useState<string>('')
  const [uploadDocType, setUploadDocType] = useState<string>('Other')
  const [uploadAssociateField, setUploadAssociateField] = useState<string>('')

  // Quick Settings
  const [showQuickSettings, setShowQuickSettings] = useState(false)
  const [currentRounded, setCurrentRounded] = useState('md')
  const [currentAccent, setCurrentAccent] = useState('blue')

  // Dashboard Setting Stats
  const [quickInfoFields, setQuickInfoFields] = useState<QuickInfoFieldDTO[]>([])
  const [_quickActions, setQuickActions] = useState<string[]>([])
  const [pinnedDocuments, setPinnedDocuments] = useState<VaultItem[]>([])
  const [signatureDocId, setSignatureDocId] = useState<string | null>(null)
  const [photoDocId, setPhotoDocId] = useState<string | null>(null)

  // In-Memory Decrypted Assets URLs
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  // Modals state
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingItem, setRenamingItem] = useState<VaultItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingItem, setDeletingItem] = useState<VaultItem | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Quick Info Edit Modal state
  const [editingField, setEditingField] = useState<QuickInfoFieldDTO | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showNewCustomField, setShowNewCustomField] = useState(false)
  const [customFieldLabel, setCustomFieldLabel] = useState('')
  const [customFieldCategory, setCustomFieldCategory] = useState<InfoCategory>('IDENTITY')
  const [customFieldValue, setCustomFieldValue] = useState('')

  // Quick Actions Configuration Modal
  const [_showCustomizeActions, _setShowCustomizeActions] = useState(false)
  const [_tempActions, _setTempActions] = useState<string[]>([])

  // Special Asset Export Engine Modal
  const [exportingAssetType, setExportingAssetType] = useState<'signature' | 'photo' | null>(null)
  const [exportWidth, setExportWidth] = useState(300)
  const [exportHeight, setExportHeight] = useState(100)
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png')
  const [exportQuality, setExportQuality] = useState(90)
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true)
  const [cropPreset, setCropPreset] = useState<string>('original')
  
  // Crop pan/zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({})
  const [revealingFieldId, setRevealingFieldId] = useState<string | null>(null)
  const [uploadingAssetType, setUploadingAssetType] = useState<'signature' | 'photo' | null>(null)

  const imageRef = useRef<HTMLImageElement>(null)
  const _fileInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  
  // Drag files state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  // --- Data Fetching & Sync ----------------------------------------

  const fetchDashboardData = useCallback(async () => {
    try {
      const data = await getVaultDashboardData()
      if (data.success) {
        setQuickInfoFields(data.quickInfoFields)
        setQuickActions(data.quickActions)
        setPinnedDocuments(data.pinnedDocuments)
        setSignatureDocId(data.signatureDocId)
        setPhotoDocId(data.photoDocId)
      }
    } catch (err) {
      console.error('Failed to retrieve dashboard settings:', err)
    }
  }, [])

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

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchItems(), fetchDashboardData()])
    setLoading(false)
  }, [fetchItems, fetchDashboardData])

  useEffect(() => {
    void refreshAll() // eslint-disable-line react-hooks/set-state-in-effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId])

  // Fetch Special Assets blobs to Object URLs in-memory
  useEffect(() => {
    let sigObjectUrl: string | null = null
    if (signatureDocId) {
      fetch(`/api/vault/download/${signatureDocId}`)
        .then(res => {
          if (!res.ok) throw new Error()
          return res.blob()
        })
        .then(blob => {
          sigObjectUrl = URL.createObjectURL(blob)
          setSignatureUrl(sigObjectUrl)
        })
        .catch(() => setSignatureUrl(null))
    } else {
      setTimeout(() => setSignatureUrl(null), 0)
    }

    return () => {
      if (sigObjectUrl) URL.revokeObjectURL(sigObjectUrl)
    }
  }, [signatureDocId])

  useEffect(() => {
    let photoObjectUrl: string | null = null
    if (photoDocId) {
      fetch(`/api/vault/download/${photoDocId}`)
        .then(res => {
          if (!res.ok) throw new Error()
          return res.blob()
        })
        .then(blob => {
          photoObjectUrl = URL.createObjectURL(blob)
          setPhotoUrl(photoObjectUrl)
        })
        .catch(() => setPhotoUrl(null))
    } else {
      setTimeout(() => setPhotoUrl(null), 0)
    }

    return () => {
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl)
    }
  }, [photoDocId])

  // --- Actions & Modals Handling -------------------------------------

  const handleCopySecret = async (fieldId: string, label: string) => {
    try {
      const res = await getVaultSecretValue(fieldId, 'copy')
      if (res.success && res.value) {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(res.value)
          toast(`Copied ${label} to clipboard`, { variant: 'success' })
        } else {
          throw new Error('Clipboard API not supported')
        }
      } else {
        throw new Error(res.error || 'Failed to decrypt value')
      }
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Copy failed', { variant: 'error' })
    }
  }

  const handleToggleReveal = async (fieldId: string) => {
    if (revealedSecrets[fieldId]) {
      setRevealedSecrets(prev => {
        const copy = { ...prev }
        delete copy[fieldId]
        return copy
      })
    } else {
      setRevealingFieldId(fieldId)
      try {
        const res = await getVaultSecretValue(fieldId, 'reveal')
        if (res.success && res.value) {
          setRevealedSecrets(prev => ({ ...prev, [fieldId]: res.value! }))
        } else {
          toast(res.error || 'Failed to reveal value', { variant: 'error' })
        }
      } catch (_err) {
        toast('Decryption error', { variant: 'error' })
      } finally {
        setRevealingFieldId(null)
      }
    }
  }

  const handleSaveField = async () => {
    if (!editingField) return
    setActionLoading(true)
    try {
      const res = await saveVaultQuickInfoField(editingField.id, editingField.category, editingField.label, editValue)
      if (res.success) {
        toast(`${editingField.label} updated`, { variant: 'success' })
        setEditingField(null)
        setEditValue('')
        fetchDashboardData()
      } else {
        toast(res.error || 'Save failed', { variant: 'error' })
      }
    } catch (_err) {
      toast('Failed to save', { variant: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveCustomField = async () => {
    if (!customFieldLabel.trim() || !customFieldValue.trim()) return
    setActionLoading(true)
    const customId = `custom_${Date.now()}`
    try {
      const res = await saveVaultQuickInfoField(customId, customFieldCategory, customFieldLabel.trim(), customFieldValue.trim())
      if (res.success) {
        toast(`Custom field "${customFieldLabel}" added`, { variant: 'success' })
        setShowNewCustomField(false)
        setCustomFieldLabel('')
        setCustomFieldValue('')
        fetchDashboardData()
      } else {
        toast(res.error || 'Failed to save custom field', { variant: 'error' })
      }
    } catch (_err) {
      toast('Failed to create field', { variant: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  const _handleDeleteCustomField = async (fieldId: string, label: string) => {
    if (!confirm(`Are you sure you want to delete the custom field "${label}"?`)) return
    try {
      const res = await deleteVaultQuickInfoField(fieldId)
      if (res.success) {
        toast(`Field deleted`, { variant: 'success' })
        fetchDashboardData()
      } else {
        toast(res.error || 'Delete failed', { variant: 'error' })
      }
    } catch (_err) {
      toast('Error deleting field', { variant: 'error' })
    }
  }

  const _handleSaveCustomizeActions = async () => {
    setActionLoading(true)
    try {
      const res = await saveVaultQuickActions(_tempActions)
      if (res.success) {
        setQuickActions(_tempActions)
        _setShowCustomizeActions(false)
        toast('Quick actions updated', { variant: 'success' })
      } else {
        toast(res.error || 'Save failed', { variant: 'error' })
      }
    } catch (_err) {
      toast('Error saving order', { variant: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  const _handleTogglePin = async (doc: VaultItem) => {
    const isPinned = pinnedDocuments.some(d => d.id === doc.id)
    try {
      const res = await toggleVaultPin(doc.id, !isPinned)
      if (res.success) {
        toast(!isPinned ? 'Pinned to Quick Access' : 'Unpinned from Quick Access', { variant: 'success' })
        fetchDashboardData()
      } else {
        toast(res.error || 'Pin operation failed', { variant: 'error' })
      }
    } catch (_err) {
      toast('Pin operation failed', { variant: 'error' })
    }
  }

  const _handleUpdateCategory = async (docId: string, cat: string) => {
    try {
      const res = await updateVaultItemCategory(docId, cat)
      if (res.success) {
        toast('Category updated', { variant: 'success' })
        fetchItems()
      } else {
        toast(res.error || 'Failed to update category', { variant: 'error' })
      }
    } catch (_err) {
      toast('Failed to update category', { variant: 'error' })
    }
  }

  // --- Special Assets Uploads ----------------------------------------

  const uploadSpecialAsset = async (type: 'signature' | 'photo', file: File) => {
    setUploadingAssetType(type)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', type === 'signature' ? 'Certificates' : 'Identity')

    try {
      const response = await fetch('/api/vault/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }
      
      const setRes = await setVaultSpecialAsset(type, result.document.id)
      if (setRes.success) {
        toast(`${type === 'signature' ? 'Signature' : 'Photo'} updated`, { variant: 'success' })
        fetchDashboardData()
      } else {
        throw new Error(setRes.error || 'Association failed')
      }
    } catch (_err) {
      toast(_err instanceof Error ? _err.message : 'Upload failed', { variant: 'error' })
    } finally {
      setUploadingAssetType(null)
    }
  }

  const handleSpecialAssetChange = (type: 'signature' | 'photo', e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadSpecialAsset(type, e.target.files[0])
      e.target.value = ''
    }
  }

  const handleDeleteSpecialAsset = async (type: 'signature' | 'photo') => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) return
    try {
      const res = await setVaultSpecialAsset(type, null)
      if (res.success) {
        toast(`${type === 'signature' ? 'Signature' : 'Photo'} deleted`, { variant: 'success' })
        fetchDashboardData()
      } else {
        toast(res.error || 'Deletion failed', { variant: 'error' })
      }
    } catch (_err) {
      toast('Error deleting asset', { variant: 'error' })
    }
  }

  // --- Image Crop & Resize Export Flow -----------------------------------

  const openExportModal = (type: 'signature' | 'photo') => {
    setExportingAssetType(type)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setMaintainAspectRatio(true)
    setCropPreset(type === 'signature' ? 'signature' : 'passport')
    
    // Set default dimensions based on presets
    if (type === 'signature') {
      setExportWidth(300)
      setExportHeight(100)
    } else {
      setExportWidth(350)
      setExportHeight(450)
    }
  }

  // Aspect Ratio and dimensions calculator
  const updateExportDimensions = (w: number, h: number, preset: string) => {
    setCropPreset(preset)
    setExportWidth(w)
    setExportHeight(h)
  }

  const handleWidthChange = (val: number) => {
    setExportWidth(val)
    if (maintainAspectRatio) {
      const ratio = getPresetRatio(cropPreset)
      setExportHeight(Math.round(val / ratio))
    }
  }

  const handleHeightChange = (val: number) => {
    setExportHeight(val)
    if (maintainAspectRatio) {
      const ratio = getPresetRatio(cropPreset)
      setExportWidth(Math.round(val * ratio))
    }
  }

  const getPresetRatio = (preset: string): number => {
    switch (preset) {
      case 'passport': return 350 / 450
      case 'id_photo': return 1
      case 'profile': return 1
      case 'signature': return 3
      default: return 1
    }
  }

  useEffect(() => {
    if (cropPreset !== 'custom' && cropPreset !== 'original') {
      const ratio = getPresetRatio(cropPreset)
      if (maintainAspectRatio) {
        setTimeout(() => setExportHeight(Math.round(exportWidth / ratio)), 0)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropPreset, maintainAspectRatio])

  // Dragging event handlers inside Crop Viewport
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handleMouseUp = () => {
    setDragging(false)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setDragging(true)
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return
    setPan({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y })
  }

  const executeDownload = () => {
    const img = imageRef.current
    if (!img || !exportingAssetType) return

    const canvas = document.createElement('canvas')
    canvas.width = exportWidth
    canvas.height = exportHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // --- Crop Calculus ------------------------------------------------
    // Container dimensions: width = 256px, height = 300px
    const Wc = 256
    const Hc = 300

    // Crop box dimensions based on aspect ratio preset
    const preset = cropPreset
    let Wb = 200
    let Hb = 200

    if (preset === 'signature') {
      Wb = 240
      Hb = 80
    } else if (preset === 'passport') {
      Wb = 180
      Hb = 231
    } else if (preset === 'original') {
      // Draw full original image
      ctx.drawImage(img, 0, 0, exportWidth, exportHeight)
      triggerCanvasDownload(canvas)
      return
    }

    const Lb = (Wc - Wb) / 2
    const Tb = (Hc - Hb) / 2

    // Original and base rendered image sizes
    const Worig = img.naturalWidth
    const Horig = img.naturalHeight

    // Fit image inside container base sizes
    let wimg = Wc
    let himg = Hc
    const aspect = Worig / Horig
    if (aspect > Wc / Hc) {
      himg = Wc / aspect
    } else {
      wimg = Hc * aspect
    }

    // Relative offsets mapping to source pixels
    const Lrel = Lb - (Wc / 2 + pan.x)
    const Trel = Tb - (Hc / 2 + pan.y)

    const Xstart = Worig / 2 + (Lrel / (wimg * zoom)) * Worig
    const Ystart = Horig / 2 + (Trel / (himg * zoom)) * Horig
    const Wsrc = (Wb / (wimg * zoom)) * Worig
    const Hsrc = (Hb / (himg * zoom)) * Horig

    // Transparency handling for JPEG
    if (exportFormat === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, exportWidth, exportHeight)
    }

    try {
      ctx.drawImage(img, Xstart, Ystart, Wsrc, Hsrc, 0, 0, exportWidth, exportHeight)
      triggerCanvasDownload(canvas)
    } catch (_err) {
      toast('Draw image failed. Zoom too far or offsets out of bounds.', { variant: 'error' })
    }
  }

  const triggerCanvasDownload = (canvas: HTMLCanvasElement) => {
    const mime = `image/${exportFormat === 'jpeg' ? 'jpeg' : exportFormat === 'webp' ? 'webp' : 'png'}`
    const quality = exportFormat === 'png' ? undefined : exportQuality / 100

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${exportingAssetType}_export.${exportFormat}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        
        // Log Audit Event
        const assetId = exportingAssetType === 'signature' ? signatureDocId : photoDocId
        logVaultAuditAction('VAULT_ASSET_DOWNLOADED', assetId || 'none', 'VAULT_ASSET')
        toast('Download started', { variant: 'success' })
        setExportingAssetType(null)
      }
    }, mime, quality)
  }

  // --- Standard Folder & File operations --------------------------------

  const navigateToFolder = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId)
    setSearchQuery('')
    setErrorMessage(null)
  }, [])

  const _handleDoubleClick = useCallback((item: VaultItem) => {
    if (item.isFolder) {
      navigateToFolder(item.id)
    }
  }, [navigateToFolder])

  const uploadFiles = useCallback(async (files: FileList | File[], selectedCat?: string) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    setErrorMessage(null)
    let completed = 0
    const errors: string[] = []

    for (const file of fileArray) {
      setUploadProgress(`Uploading ${file.name} (${completed + 1}/${fileArray.length})`)
      
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
      formData.append('category', selectedCat || _docCategoryFilter === 'All' ? 'Other' : _docCategoryFilter)

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
        
        // Log Audit
        logVaultAuditAction('VAULT_DOCUMENT_UPLOADED', result.document.id, 'VAULT_DOCUMENT')
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
      toast(`${completed} file(s) uploaded successfully`, { variant: 'success' })
      fetchItems()
    }
  }, [currentFolderId, fetchItems, _docCategoryFilter])

  const _handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(e.target.files)
      e.target.value = ''
    }
  }, [uploadFiles])

  // Drag & Drop
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

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return
    const folderName = newFolderName.trim()
    const previousItems = [...items]

    const tempItem: VaultItem = {
      id: `temp-f-${Date.now()}`,
      name: folderName,
      searchName: folderName.toLowerCase(),
      isFolder: true,
      parentId: currentFolderId,
      mimeGroup: null,
      extension: null,
      fileSize: null,
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    setItems(prev => [tempItem, ...prev])
    setNewFolderName('')
    setShowNewFolder(false)
    setErrorMessage(null)

    writeQueue.add({
      id: `vault-folder-${Date.now()}`,
      dedupKey: `vault-folder-${folderName}`,
      run: async () => {
        const res = await createVaultFolder(folderName, currentFolderId)
        if (res.success) {
          fetchItems()
        }
        return res
      },
      rollback: () => {
        setItems(previousItems)
        toast('Failed to create folder', { variant: 'error' })
      }
    })
  }, [newFolderName, currentFolderId, items, fetchItems])

  const handleRename = useCallback(async () => {
    if (!renamingItem || !renameValue.trim()) return
    const newName = renameValue.trim()
    const targetId = renamingItem.id
    const previousItems = [...items]

    setItems(prev => prev.map(item => item.id === targetId ? { ...item, name: newName } : item))
    setRenamingItem(null)
    setRenameValue('')
    setErrorMessage(null)

    writeQueue.add({
      id: `vault-rename-${targetId}-${Date.now()}`,
      dedupKey: `vault-rename-${targetId}`,
      run: async () => {
        const res = await renameVaultItem(targetId, newName)
        if (res.success) {
          fetchItems()
        }
        return res
      },
      rollback: () => {
        setItems(previousItems)
        toast('Failed to rename item', { variant: 'error' })
      }
    })
  }, [renamingItem, renameValue, items, fetchItems])

  const handleDelete = useCallback(async () => {
    if (!deletingItem) return
    const targetId = deletingItem.id
    const previousItems = [...items]

    setItems(prev => prev.filter(item => item.id !== targetId))
    setDeletingItem(null)
    setErrorMessage(null)

    writeQueue.add({
      id: `vault-delete-${targetId}-${Date.now()}`,
      dedupKey: `vault-delete-${targetId}`,
      run: async () => {
        const res = await deleteVaultItem(targetId)
        if (res.success) {
          fetchItems()
          fetchDashboardData() // In case pinned or signature/photo was deleted
        }
        return res
      },
      rollback: () => {
        setItems(previousItems)
        toast('Failed to delete item', { variant: 'error' })
      }
    })
  }, [deletingItem, items, fetchItems, fetchDashboardData])

  const handleDownload = useCallback(async (item: VaultItem) => {
    if (item.isFolder) return
    setErrorMessage(null)
    
    try {
      let key = vaultKey
      if (!key) {
        const { getVaultKeyAction } = await import('@/app/actions/vault')
        const res = await getVaultKeyAction()
        if (res.success && res.key) {
          key = res.key
          setVaultKey(res.key)
        } else {
          throw new Error(res.error || 'Could not retrieve encryption key.')
        }
      }

      // Fetch the raw encrypted bytes from the API
      const response = await fetch(`/api/vault/download/${item.id}`)
      if (!response.ok) {
        throw new Error('Failed to download encrypted file.')
      }

      const ivHex = response.headers.get('x-iv-hex')
      const tagHex = response.headers.get('x-tag-hex')
      
      if (!ivHex || !tagHex) {
        throw new Error('Missing encryption metadata headers.')
      }

      const encryptedBuffer = await response.arrayBuffer()

      // Decrypt client-side
      const decryptedBuffer = await decryptBufferClientSide(encryptedBuffer, key, ivHex, tagHex)

      // Download file in browser
      const blob = new Blob([decryptedBuffer], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }, 100)

      // Log Audit Log
      logVaultAuditAction('VAULT_DOCUMENT_DOWNLOADED', item.id, 'VAULT_DOCUMENT')
      toast('File decrypted and downloaded successfully', { variant: 'success' })
    } catch (error) {
      console.error('Download/decryption error:', error)
      toast(error instanceof Error ? error.message : 'Failed to download and decrypt file', { variant: 'error' })
    }
  }, [vaultKey])

  // (filteredItems and toggleSort removed â€” the new layout uses categoryItems computed below)

  // Helper: open upload modal pre-filled for a quick-info field document link
  const openUploadForField = (fieldId: string, fieldLabel: string) => {
    setSelectedUploadFile(null)
    setUploadDocName(fieldLabel + ' Document')
    setUploadCategory('Identity')
    setUploadSubCategory('')
    setUploadDocType('Other')
    setUploadAssociateField(fieldId)
    setShowUploadModal(true)
  }

  // Helper: upload via modal submit
  const handleModalUpload = async () => {
    if (!selectedUploadFile || !uploadDocName.trim()) return
    setActionLoading(true)
    const formData = new FormData()
    formData.append('file', selectedUploadFile)
    formData.append('name', uploadDocName.trim())
    formData.append('category', uploadCategory)
    if (uploadSubCategory) formData.append('subCategory', uploadSubCategory)
    if (uploadDocType) formData.append('documentType', uploadDocType)
    if (uploadAssociateField) formData.append('associateWithInfoField', uploadAssociateField)
    try {
      const res = await fetch('/api/vault/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      toast(`Uploaded: ${uploadDocName}`, { variant: 'success' })
      setShowUploadModal(false)
      setSelectedUploadFile(null)
      setUploadDocName('')
      fetchItems()
      fetchDashboardData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', { variant: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  // Settings stubs (would persist to user preferences in a real impl)
  const updateRoundedCornersSetting = (val: string) => setCurrentRounded(val)
  const updateAccentColorSetting = (val: string) => setCurrentAccent(val)

  // Compute per-category stats for dashboard cabinets
  const getCategoryStats = (categoryName: string) => {
    const docs = items.filter(d => !d.isFolder && d.metadata?.category === categoryName)
    const count = docs.length
    const names = docs.map(d => d.name).slice(0, 3).join(', ')
    return { count, summary: names ? `${names}${docs.length > 3 ? '...' : ''}` : 'No documents yet' }
  }

  // Compute items for the active category view
  const categoryItems = selectedCategory === null ? [] : items.filter(item => {
    if (item.isFolder) return false
    if (item.metadata?.category !== selectedCategory) return false
    if (selectedSubCategory && selectedSubCategory !== 'All') {
      const sub = item.metadata?.subCategory || item.metadata?.educationLevel || item.metadata?.documentType
      if (sub !== selectedSubCategory) return false
    }
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Compute recent documents (last 5 files by date)
  const recentDocuments = items
    .filter(i => !i.isFolder)
    .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime())
    .slice(0, 5)

  return (
    <div
      className="space-y-5 relative pb-10"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-[var(--color-primary)]/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-[var(--color-bg-surface)] border-2 border-dashed border-[var(--color-primary)] rounded-[var(--radius-lg)] p-12 text-center shadow-2xl">
            <Upload className="w-12 h-12 text-[var(--color-primary)] mx-auto mb-3" />
            <p className="text-sm font-bold text-[var(--color-text-main)]">Drop files to upload</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Files will be classified and encrypted</p>
          </div>
        </div>
      )}

      {/* PAGE HEADER */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--color-text-main)] tracking-tight leading-tight">Secure Vault</h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Your encrypted documents and important information</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuickSettings(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer"
          >
            <Settings className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-300 ${showQuickSettings ? 'rotate-90' : ''}`} />
          </button>
          <button
            onClick={() => void refreshAll()}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 text-[var(--color-text-muted)] ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSelectedUploadFile(null)
              setUploadDocName('')
              setUploadCategory(selectedCategory || 'Identity')
              setUploadSubCategory(selectedSubCategory !== 'All' ? selectedSubCategory : '')
              setUploadDocType('Other')
              setUploadAssociateField('')
              setShowUploadModal(true)
            }}
            icon={<Upload className="w-4 h-4" />}
          >
            Upload
          </Button>
        </div>
      </div>

      {/* Quick Settings */}
      {showQuickSettings && (
        <Card className="border border-[var(--color-border)] p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">Corner Roundness</label>
              <div className="flex gap-2">
                {[{id:'none',label:'Sharp'},{id:'md',label:'Default'},{id:'full',label:'Soft'}].map(opt => (
                  <button key={opt.id} onClick={() => updateRoundedCornersSetting(opt.id)}
                    className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-sm)] border transition-all cursor-pointer ${
                      currentRounded===opt.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]'
                    }`}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider block">Accent Color</label>
              <div className="flex gap-1.5 flex-wrap">
                {[{id:'blue',color:'#007aff'},{id:'purple',color:'#a855f7'},{id:'green',color:'#22c55e'},{id:'orange',color:'#f97316'},{id:'indigo',color:'#818cf8'}].map(opt => (
                  <button key={opt.id} onClick={() => updateAccentColorSetting(opt.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] border transition-all cursor-pointer flex items-center gap-1.5 ${
                      currentAccent===opt.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{backgroundColor:opt.color}} />
                    {opt.id.charAt(0).toUpperCase()+opt.id.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-[var(--radius-md)] px-3 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin shrink-0" />
          <span className="text-sm font-semibold text-[var(--color-primary)]">{uploadProgress}</span>
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-[var(--radius-md)] px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-0.5 rounded hover:bg-rose-500/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {selectedCategory === null ? (
        /* DASHBOARD VIEW */
        <div className="space-y-5">

          {/* QUICK ACCESS INFORMATION */}
          <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Maximize className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Quick Access Information</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowNewCustomField(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add Field
                </button>
                <button onClick={() => setShowQuickSettings(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] px-2 py-1 rounded-[var(--radius-sm)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer">
                  <Settings className="w-3.5 h-3.5" /> Customize
                </button>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {quickInfoFields.map(field => {
                const isSensitive = ['identity_aadhaar','identity_pan','banking_account_number','personal_phone','personal_email'].includes(field.id) || field.id.startsWith('custom_')
                const showDownload = ['identity_aadhaar','identity_pan','banking_account_number'].includes(field.id)
                return (
                  <div key={field.id}
                    className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-bg-base)] flex flex-col p-3 gap-2 hover:border-[var(--color-primary)]/40 hover:shadow-sm transition-all duration-150">
                    {/* Label + AES badge */}
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[11px] font-semibold text-[var(--color-text-main)] leading-tight">{field.label}</span>
                      {isSensitive && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          AES-256
                        </span>
                      )}
                    </div>
                    {/* Value */}
                    <div className="flex items-center gap-1.5 min-h-[24px]">
                      <p className="font-mono text-sm font-semibold text-[var(--color-text-main)] truncate flex-1 select-all">
                        {field.hasValue
                          ? (isSensitive && !revealedSecrets[field.id]
                              ? field.maskedValue
                              : (revealedSecrets[field.id] || field.maskedValue))
                          : <span className="text-[var(--color-text-muted)]">&mdash;</span>
                        }
                      </p>
                      {isSensitive && field.hasValue && (
                        <button onClick={() => handleToggleReveal(field.id)} disabled={revealingFieldId === field.id}
                          className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] cursor-pointer transition-colors shrink-0">
                          {revealingFieldId === field.id ? <Loader2 className="w-3 h-3 animate-spin" /> : revealedSecrets[field.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                    {/* Actions always visible */}
                    <div className="flex items-center gap-px pt-1.5 border-t border-[var(--color-border)]/50 mt-auto">
                      <button onClick={() => handleCopySecret(field.id, field.label)} disabled={!field.hasValue}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] rounded-l transition-colors disabled:opacity-30 cursor-pointer touch-manipulation">
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                      <div className="w-px h-4 bg-[var(--color-border)]" />
                      {showDownload && field.documentId ? (
                        <button onClick={() => { const a=document.createElement('a'); a.href=`/api/vault/download/${field.documentId}`; document.body.appendChild(a); a.click(); setTimeout(()=>document.body.removeChild(a),100) }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer touch-manipulation">
                          <Download className="w-3 h-3" /> Download
                        </button>
                      ) : showDownload ? (
                        <button onClick={() => openUploadForField(field.id, field.label)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer touch-manipulation">
                          <Download className="w-3 h-3" /> Download
                        </button>
                      ) : (
                        <div className="flex-1" />
                      )}
                      <div className="w-px h-4 bg-[var(--color-border)]" />
                      <button
                        onClick={() => {
                          setEditingField(field)
                          if (field.hasValue) {
                            getVaultSecretValue(field.id, 'reveal').then(r => { if (r.success) setEditValue(r.value || '') })
                          } else setEditValue('')
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] rounded-r transition-colors cursor-pointer touch-manipulation">
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* BOTTOM 3-COLUMN GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* 1. DOCUMENT CABINETS */}
            <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
                <Folder className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Document Cabinets</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {([
                  { name: 'Identity',        Color: 'text-emerald-500', Bg: 'bg-emerald-500/10' },
                  { name: 'Academics',       Color: 'text-amber-500',   Bg: 'bg-amber-500/10' },
                  { name: 'Career',          Color: 'text-blue-500',    Bg: 'bg-blue-500/10' },
                  { name: 'Financial',       Color: 'text-green-500',   Bg: 'bg-green-500/10' },
                  { name: 'Other Important', Color: 'text-violet-500',  Bg: 'bg-violet-500/10' },
                ]).map(cat => {
                  const s = getCategoryStats(cat.name)
                  return (
                    <button key={cat.name}
                      onClick={() => {
                        setSelectedCategory(cat.name)
                        if (cat.name==='Academics') setSelectedSubCategory('10th')
                        else if (cat.name==='Career') setSelectedSubCategory('Resumes')
                        else if (cat.name==='Financial') setSelectedSubCategory('Bank Documents')
                        else setSelectedSubCategory('All')
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-accent)]/40 transition-colors cursor-pointer text-left group touch-manipulation">
                      <div className={`w-8 h-8 rounded-[var(--radius-sm)] ${cat.Bg} flex items-center justify-center shrink-0`}>
                        <Folder className={`w-4 h-4 ${cat.Color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-text-main)] group-hover:text-[var(--color-primary)] transition-colors">{cat.name}</p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">{s.count} document{s.count !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. OFFICIAL ASSETS */}
            <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
                <Upload className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Official Assets</span>
              </div>
              <div className="p-4 space-y-4">
                {/* Signature */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--color-text-main)]">Official Signature</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[var(--radius-sm)] ${signatureDocId ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-500'}`}>
                      {signatureDocId ? 'Active' : 'Missing'}
                    </span>
                  </div>
                  <div className="h-[80px] bg-zinc-950 rounded-[var(--radius-md)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden relative">
                    {signatureUrl ? <img src={signatureUrl} alt="Signature" className="h-full object-contain p-2 max-w-full" /> : <span className="text-[10px] text-zinc-600 italic">No signature</span>}
                    {uploadingAssetType==='signature' && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" /></div>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => signatureInputRef.current?.click()} disabled={uploadingAssetType!==null}>Upload Signature</Button>
                    {signatureDocId && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openExportModal('signature')} icon={<Download className="w-3.5 h-3.5" />} />
                        <Button variant="danger" size="sm" onClick={() => handleDeleteSpecialAsset('signature')} icon={<Trash2 className="w-3.5 h-3.5" />} />
                      </>
                    )}
                    <input ref={signatureInputRef} type="file" accept="image/*" onChange={e => handleSpecialAssetChange('signature', e)} className="hidden" />
                  </div>
                </div>
                {/* Photo */}
                <div className="space-y-2 pt-3 border-t border-[var(--color-border)]/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--color-text-main)]">Official Photo</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[var(--radius-sm)] ${photoDocId ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-500'}`}>
                      {photoDocId ? 'Active' : 'Missing'}
                    </span>
                  </div>
                  <div className="h-[90px] bg-zinc-950 rounded-[var(--radius-md)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden relative">
                    {photoUrl ? <img src={photoUrl} alt="Photo" className="h-full object-cover p-1 max-w-full" /> : <span className="text-[10px] text-zinc-600 italic">No photo</span>}
                    {uploadingAssetType==='photo' && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" /></div>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => photoInputRef.current?.click()} disabled={uploadingAssetType!==null}>Upload Photo</Button>
                    {photoDocId && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openExportModal('photo')} icon={<Download className="w-3.5 h-3.5" />} />
                        <Button variant="danger" size="sm" onClick={() => handleDeleteSpecialAsset('photo')} icon={<Trash2 className="w-3.5 h-3.5" />} />
                      </>
                    )}
                    <input ref={photoInputRef} type="file" accept="image/*" onChange={e => handleSpecialAssetChange('photo', e)} className="hidden" />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. RECENT DOCUMENTS */}
            <div className="border border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
                <RefreshCw className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Recent Documents</span>
              </div>
              {loading ? (
                <div className="p-4 space-y-3">
                  {[1,2,3,4,5].map(i => <SkeletonWidget key={i} />)}
                </div>
              ) : recentDocuments.length === 0 ? (
                <div className="p-8 flex flex-col items-center gap-2 text-center">
                  <FileText className="w-8 h-8 text-[var(--color-text-muted)]/30" />
                  <p className="text-xs text-[var(--color-text-muted)]">No documents uploaded yet</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {recentDocuments.map(item => {
                    const IconComp = getFileIcon(item.mimeGroup, false)
                    const iconCol = getFileColor(item.mimeGroup, false)
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-accent)]/30 transition-colors group">
                        <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--color-accent)] flex items-center justify-center shrink-0">
                          <IconComp className={`w-4 h-4 ${iconCol}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-text-main)] truncate">{item.name}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)]">
                            {item.metadata?.category || 'Vault'} &bull; {item.mimeGroup?.toUpperCase() || 'FILE'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap hidden sm:block">
                            {formatDate(item.updatedAt ?? item.createdAt)}
                          </span>
                          <button onClick={() => handleDownload(item)}
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)] transition-all cursor-pointer">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <button
                    onClick={() => { setSelectedCategory('Identity'); setSelectedSubCategory('All') }}
                    className="w-full px-4 py-3 text-xs font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors cursor-pointer text-left">
                    View all documents &rarr;
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      ) : (
        /* CATEGORY VIEW */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => { setSelectedCategory(null); setSearchQuery('') }}>
              &larr; Back to Vault
            </Button>
            <h2 className="text-lg font-black text-[var(--color-text-main)] flex items-center gap-2">
              <Shield className="w-5 h-5 text-[var(--color-primary)]" />
              {selectedCategory}
            </h2>
          </div>

          {['Academics','Career','Financial'].includes(selectedCategory) && (
            <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)]/50 pb-2">
              {(selectedCategory==='Academics'
                ? ['10th','12th','B.Tech / Graduation','Certifications']
                : selectedCategory==='Career'
                ? ['Resumes','Employment','Offer Letters','Other Career']
                : ['Bank Documents','Tax Documents','Other Financial']
              ).map(sub => (
                <button key={sub} onClick={() => setSelectedSubCategory(sub)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                    selectedSubCategory===sub ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)]'
                  }`}>{sub}</button>
              ))}
            </div>
          )}

          <div className="max-w-md">
            <SearchInput value={searchQuery} onValueChange={setSearchQuery} placeholder={`Search in ${selectedCategory}...`} />
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <SkeletonWidget /><SkeletonWidget /><SkeletonWidget />
            </div>
          ) : categoryItems.length === 0 ? (
            <EmptyState
              title="No documents here"
              description={searchQuery ? 'No matches found.' : `Upload your first ${selectedCategory} document.`}
              icon={<Upload className="w-6 h-6" />}
              action={
                <Button variant="primary" size="sm"
                  onClick={() => {
                    setSelectedUploadFile(null); setUploadDocName(''); setUploadCategory(selectedCategory)
                    setUploadSubCategory(selectedSubCategory!=='All' ? selectedSubCategory : '')
                    setUploadDocType('Other'); setUploadAssociateField(''); setShowUploadModal(true)
                  }}
                  icon={<Plus className="w-4 h-4" />}>Upload Document</Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {categoryItems.map(item => {
                const IconComponent = getFileIcon(item.mimeGroup, item.isFolder)
                const iconColor = getFileColor(item.mimeGroup, item.isFolder)
                return (
                  <Card key={item.id} className="p-3 border border-[var(--color-border)] bg-[var(--color-bg-surface)]/60 flex flex-col gap-2 relative transition-all hover:shadow-md rounded-[var(--radius-lg)]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
                        <IconComponent className={`w-4 h-4 ${iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--color-text-main)] truncate">{item.name}</p>
                        <p className="text-[10px] font-mono text-[var(--color-text-muted)]">{formatFileSize(item.fileSize)} &middot; {formatDate(item.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 pt-2 border-t border-[var(--color-border)]/40">
                      <Button variant="outline" size="sm" className="flex-1 text-xs min-h-[40px] touch-manipulation" onClick={() => handleDownload(item)} icon={<Download className="w-3.5 h-3.5" />}>Download</Button>
                      <Button variant="ghost" size="sm" className="px-3 min-h-[40px] text-rose-500 hover:bg-rose-500/10 touch-manipulation" onClick={() => setDeletingItem(item)} icon={<Trash2 className="w-3.5 h-3.5" />} />
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Encryption Footer */}
      <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--color-border)]">
        <Shield className="w-4 h-4 text-emerald-500" />
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">All documents encrypted with AES-256-GCM at rest</span>
      </div>

      {/* Upload Document Modal */}
      <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title="Upload Document" size="md">
        <div className="space-y-4 pt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Select File</label>
            <input type="file"
              onChange={e => {
                if (e.target.files?.[0]) {
                  const f = e.target.files[0]
                  setSelectedUploadFile(f)
                  if (!uploadDocName) setUploadDocName(f.name.replace(/\.[^.]+$/, ''))
                }
              }}
              className="text-xs text-[var(--color-text-muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-[var(--radius-sm)] file:border-0 file:text-xs file:font-semibold file:bg-[var(--color-accent)] file:text-[var(--color-text-main)] file:cursor-pointer"
            />
            {selectedUploadFile && <span className="text-xs font-mono text-[var(--color-text-muted)]">{selectedUploadFile.name} ({formatFileSize(selectedUploadFile.size)})</span>}
          </div>
          <Input type="text" label="Document Name" placeholder="e.g. Aadhaar Card" value={uploadDocName} onChange={e => setUploadDocName(e.target.value)} />
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Category</label>
            <select value={uploadCategory} onChange={e => { const c=e.target.value; setUploadCategory(c); if(c==='Academics') setUploadSubCategory('10th'); else if(c==='Career') setUploadSubCategory('Resumes'); else if(c==='Financial') setUploadSubCategory('Bank Documents'); else setUploadSubCategory('') }}
              className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
              <option value="Identity">Identity</option>
              <option value="Academics">Academics</option>
              <option value="Career">Career</option>
              <option value="Financial">Financial</option>
              <option value="Other Important">Other Important</option>
            </select>
          </div>
          {uploadCategory==='Academics' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Education Level</label>
              <select value={uploadSubCategory} onChange={e => setUploadSubCategory(e.target.value)}
                className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
                <option>10th</option><option>12th</option><option>B.Tech / Graduation</option><option>Certifications</option>
              </select>
            </div>
          )}
          {uploadCategory==='Career' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Career Sub</label>
              <select value={uploadSubCategory} onChange={e => setUploadSubCategory(e.target.value)}
                className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
                <option>Resumes</option><option>Employment</option><option>Offer Letters</option><option>Other Career</option>
              </select>
            </div>
          )}
          {uploadCategory==='Financial' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Financial Sub</label>
              <select value={uploadSubCategory} onChange={e => setUploadSubCategory(e.target.value)}
                className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
                <option>Bank Documents</option><option>Tax Documents</option><option>Other Financial</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Document Type</label>
            <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
              className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
              <option>Marksheet</option><option>Certificate</option><option>Degree</option><option>ID Card</option><option>Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase">Link to Quick Access Field (optional)</label>
            <select value={uploadAssociateField} onChange={e => setUploadAssociateField(e.target.value)}
              className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
              <option value="">None</option>
              <option value="identity_aadhaar">Aadhaar Card</option>
              <option value="identity_pan">PAN Card</option>
              <option value="banking_account_number">Bank Account</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <Button variant="outline" size="sm" onClick={() => setShowUploadModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={actionLoading || !selectedUploadFile || !uploadDocName.trim()} isLoading={actionLoading} onClick={handleModalUpload}>Save & Upload</Button>
          </div>
        </div>
      </Modal>

      {/* New Folder Modal */}
      <Modal isOpen={showNewFolder} onClose={() => setShowNewFolder(false)} title="New Folder" size="sm">
        <div className="space-y-4 pt-1">
          <Input type="text" placeholder="Folder name" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => { if(e.key==='Enter' && newFolderName.trim()) handleCreateFolder() }} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNewFolder(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()} isLoading={actionLoading} icon={<Check className="w-4 h-4" />}>Create</Button>
          </div>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal isOpen={!!renamingItem} onClose={() => setRenamingItem(null)} title="Rename" size="sm">
        {renamingItem && (
          <div className="space-y-4 pt-1">
            <p className="text-xs text-[var(--color-text-muted)] font-semibold">Rename &ldquo;{renamingItem.name}&rdquo;</p>
            <Input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if(e.key==='Enter' && renameValue.trim()) handleRename() }} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRenamingItem(null)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleRename} disabled={!renameValue.trim()} isLoading={actionLoading} icon={<Check className="w-4 h-4" />}>Rename</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deletingItem} onClose={() => setDeletingItem(null)} title={`Delete ${deletingItem?.isFolder ? 'Folder' : 'File'}`} size="sm">
        {deletingItem && (
          <div className="space-y-4 pt-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed pt-1">
                Permanently delete <span className="font-bold text-[var(--color-text-main)]">&ldquo;{deletingItem.name}&rdquo;</span>?
                {deletingItem.isFolder && <span className="block text-xs text-rose-500 font-semibold mt-1">All files inside will also be deleted.</span>}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingItem(null)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleDelete} isLoading={actionLoading} icon={<Trash2 className="w-4 h-4" />}>Delete</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Quick Info Field Modal */}
      <Modal isOpen={!!editingField} onClose={() => setEditingField(null)} title={`Edit ${editingField?.label}`} size="sm">
        {editingField && (
          <div className="space-y-4 pt-1">
            <Input type="text" label={editingField.label} value={editValue} onChange={e => setEditValue(e.target.value)} placeholder={`Enter ${editingField.label.toLowerCase()}`} onKeyDown={e => { if(e.key==='Enter') handleSaveField() }} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingField(null)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSaveField} isLoading={actionLoading} icon={<Check className="w-4 h-4" />}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* New Custom Field Modal */}
      <Modal isOpen={showNewCustomField} onClose={() => setShowNewCustomField(false)} title="New Custom Field" size="sm">
        <div className="space-y-4 pt-1">
          <Input type="text" label="Field Label" placeholder="e.g. Insurance Policy Number" value={customFieldLabel} onChange={e => setCustomFieldLabel(e.target.value)} autoFocus />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Category</label>
            <select value={customFieldCategory} onChange={e => setCustomFieldCategory(e.target.value as InfoCategory)}
              className="w-full bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
              <option value="IDENTITY">Identity</option>
              <option value="BANKING">Banking</option>
              <option value="PERSONAL">Personal</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <Input type="text" label="Field Value" placeholder="e.g. POL-987654321" value={customFieldValue} onChange={e => setCustomFieldValue(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNewCustomField(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSaveCustomField} disabled={!customFieldLabel.trim()||!customFieldValue.trim()} isLoading={actionLoading} icon={<Check className="w-4 h-4" />}>Add Field</Button>
          </div>
        </div>
      </Modal>

      {/* Asset Export Modal */}
      <Modal isOpen={!!exportingAssetType} onClose={() => setExportingAssetType(null)} title={`Download: ${exportingAssetType}`} size="lg">
        {exportingAssetType && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
            <div className="flex flex-col items-center gap-3">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">Drag to pan, slider to zoom</span>
              <div
                className="relative overflow-hidden w-64 h-[300px] bg-zinc-950 border border-[var(--color-border)] rounded-[var(--radius-lg)] flex items-center justify-center cursor-move"
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleMouseUp}
              >
                {cropPreset==='signature' && <div className="absolute w-[240px] h-[80px] border-2 border-dashed border-emerald-500 pointer-events-none z-10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]" />}
                {cropPreset==='passport' && <div className="absolute w-[180px] h-[231px] border-2 border-dashed border-emerald-500 pointer-events-none z-10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]" />}
                {(cropPreset==='id_photo'||cropPreset==='profile') && <div className="absolute w-[200px] h-[200px] border-2 border-dashed border-emerald-500 pointer-events-none z-10 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]" />}
                {cropPreset==='original' && <div className="absolute inset-2 border-2 border-dashed border-white/40 pointer-events-none z-10" />}
                {exportingAssetType==='signature' && signatureUrl && (
                  <img ref={imageRef} src={signatureUrl} alt="Source" draggable={false}
                    className="absolute max-w-none max-h-none pointer-events-none select-none transition-none"
                    style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,transformOrigin:'center',width:'256px',height:'auto'}} />
                )}
                {exportingAssetType==='photo' && photoUrl && (
                  <img ref={imageRef} src={photoUrl} alt="Source" draggable={false}
                    className="absolute max-w-none max-h-none pointer-events-none select-none transition-none"
                    style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,transformOrigin:'center',height:'300px',width:'auto'}} />
                )}
              </div>
              {cropPreset!=='original' && (
                <div className="w-full max-w-[256px] space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[var(--color-text-muted)]">
                    <span>ZOOM</span><span>{zoom.toFixed(1)}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ZoomOut className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <input type="range" min="0.5" max="4" step="0.05" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
                    <ZoomIn className="w-4 h-4 text-[var(--color-text-muted)]" />
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setZoom(1); setPan({x:0,y:0}) }} icon={<RotateCcw className="w-3.5 h-3.5" />}>Reset</Button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <span className="text-xs font-black uppercase text-[var(--color-text-muted)]">Export Settings</span>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--color-text-muted)]">PRESET</label>
                <select value={cropPreset}
                  onChange={e => { const p=e.target.value; if(p==='original') setCropPreset('original'); else if(p==='passport') updateExportDimensions(350,450,'passport'); else if(p==='id_photo') updateExportDimensions(600,600,'id_photo'); else if(p==='profile') updateExportDimensions(800,800,'profile'); else if(p==='signature') updateExportDimensions(300,100,'signature'); else setCropPreset('custom') }}
                  className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-2 text-sm text-[var(--color-text-main)] focus:outline-none">
                  <option value="original">Original Size</option>
                  {exportingAssetType==='signature' ? <option value="signature">Standard Signature (3:1)</option> : <><option value="passport">Passport Photo</option><option value="id_photo">ID Photo (1:1)</option><option value="profile">Profile (1:1)</option></>}
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" label="Width (px)" value={exportWidth} onChange={e => handleWidthChange(parseInt(e.target.value)||0)} disabled={cropPreset==='original'} />
                <Input type="number" label="Height (px)" value={exportHeight} onChange={e => handleHeightChange(parseInt(e.target.value)||0)} disabled={cropPreset==='original'} />
              </div>
              {cropPreset!=='original' && (
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--color-text-main)]">
                  <input type="checkbox" checked={maintainAspectRatio} onChange={e => setMaintainAspectRatio(e.target.checked)} className="rounded accent-[var(--color-primary)]" />
                  Lock Aspect Ratio
                </label>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[var(--color-text-muted)]">FORMAT</label>
                <div className="flex gap-2">
                  {(['png','jpeg','webp'] as const).map(fmt => (
                    <button key={fmt} onClick={() => setExportFormat(fmt)}
                      className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-[var(--radius-sm)] border transition-all cursor-pointer ${
                        exportFormat===fmt ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]'
                      }`}>{fmt}</button>
                  ))}
                </div>
              </div>
              {exportFormat!=='png' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[var(--color-text-muted)]">
                    <span>QUALITY</span><span>{exportQuality}%</span>
                  </div>
                  <input type="range" min="10" max="100" step="5" value={exportQuality} onChange={e => setExportQuality(parseInt(e.target.value))} className="w-full accent-[var(--color-primary)]" />
                </div>
              )}
              <div className="flex gap-2 pt-4 border-t border-[var(--color-border)]">
                <Button variant="outline" className="flex-1" onClick={() => setExportingAssetType(null)}>Cancel</Button>
                <Button variant="primary" className="flex-1" onClick={executeDownload} icon={<Download className="w-4 h-4" />}>Download</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}
