"use client"

/**
 * VaultUploader — Tracker-owned Uppy adapter for Vault file uploads.
 *
 * Architecture rules:
 * - @uppy/* is ONLY imported in this file. Nothing else in the codebase
 *   imports Uppy directly — they use this component.
 * - Encryption happens server-side at /api/vault/upload. Uppy sends
 *   plaintext multipart — the server runs encryptBuffer() before writing.
 *   Never bypass this by uploading pre-encrypted bytes from the client.
 * - This component replaces the manual <input type="file"> + fetch loop
 *   in VaultPanel's upload modal, providing:
 *     - Multiple file selection
 *     - Per-file progress bars
 *     - Cancellation
 *     - Retry on failure
 *     - Clear upload states
 *     - Mobile-friendly file picker
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import Uppy from '@uppy/core'
import XHRUpload from '@uppy/xhr-upload'
import { VAULT_MAX_FILE_SIZE_CLIENT } from '@/lib/vault-crypto-client'
import { Button } from '@/design-system'
import { Upload, X, RefreshCw, CheckCircle2, AlertTriangle, Loader2, FileText } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultUploaderProps {
  /** Extra multipart fields appended to every upload request */
  extraFields?: Record<string, string>
  /** Called when all queued files finish uploading successfully */
  onAllComplete?: (fileIds: string[]) => void
  /** Called per-file on success with the server's document response */
  onFileSuccess?: (fileName: string, docId: string) => void
  /** Called per-file on failure */
  onFileError?: (fileName: string, error: string) => void
  /** Max number of simultaneous uploads (default 1 — sequential) */
  concurrency?: number
}

interface FileState {
  id: string
  name: string
  size: number
  progress: number        // 0–100
  status: 'queued' | 'uploading' | 'success' | 'error' | 'cancelled'
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VaultUploader({
  extraFields = {},
  onAllComplete,
  onFileSuccess,
  onFileError,
  concurrency = 1,
}: VaultUploaderProps) {
  const uppyRef = useRef<Uppy | null>(null)
  const [files, setFiles] = useState<FileState[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Initialise Uppy once ────────────────────────────────────────────

  useEffect(() => {
    const uppy = new Uppy({
      autoProceed: false,
      allowMultipleUploadBatches: true,
      restrictions: {
        maxFileSize: VAULT_MAX_FILE_SIZE_CLIENT,
        // No type restriction — Vault accepts all file types
      },
    })

    uppy.use(XHRUpload, {
      endpoint: '/api/vault/upload',
      fieldName: 'file',
      formData: true,
      limit: concurrency,
      // Credentials (session cookie) are sent automatically via same-origin fetch
      withCredentials: true,
    })

    // ── Event listeners ─────────────────────────────────────────────

    uppy.on('file-added', (file) => {
      setFiles(prev => [
        ...prev,
        {
          id: file.id,
          name: file.name ?? 'Unknown',
          size: file.size ?? 0,
          progress: 0,
          status: 'queued',
        },
      ])
    })

    uppy.on('file-removed', (file) => {
      setFiles(prev => prev.filter(f => f.id !== file.id))
    })

    uppy.on('upload-progress', (file, progress) => {
      if (!file) return
      const pct = progress.bytesTotal
        ? Math.round((progress.bytesUploaded / progress.bytesTotal) * 100)
        : 0
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id ? { ...f, progress: pct, status: 'uploading' } : f
        )
      )
    })

    uppy.on('upload-success', (file, response) => {
      if (!file) return
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id ? { ...f, progress: 100, status: 'success' } : f
        )
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docId = (response.body as any)?.document?.id ?? ''
      onFileSuccess?.(file.name ?? '', docId)
    })

    uppy.on('upload-error', (file, error) => {
      if (!file) return
      const msg = error.message ?? 'Upload failed'
      setFiles(prev =>
        prev.map(f =>
          f.id === file.id ? { ...f, status: 'error', error: msg } : f
        )
      )
      onFileError?.(file.name ?? '', msg)
    })

    uppy.on('upload', () => setIsUploading(true))

    uppy.on('complete', (result) => {
      setIsUploading(false)
      if (result.successful.length > 0 && result.failed.length === 0) {
        onAllComplete?.(result.successful.map(f => f.id))
      }
    })

    uppyRef.current = uppy

    return () => {
      uppy.close()
      uppyRef.current = null
    }
    // Only run on mount — extraFields applied per-upload via meta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Apply extra fields as Uppy meta ────────────────────────────────

  useEffect(() => {
    uppyRef.current?.setMeta(extraFields)
  }, [extraFields])

  // ── Handlers ────────────────────────────────────────────────────────

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    picked.forEach(file => {
      try {
        uppyRef.current?.addFile({
          name: file.name,
          type: file.type,
          data: file,
          source: 'local',
        })
      } catch (err) {
        // Uppy throws if restriction violated — show inline
        console.warn('[VaultUploader] addFile rejected:', err)
      }
    })
    // Reset input so the same file can be re-selected after removal
    e.target.value = ''
  }, [])

  const handleUpload = useCallback(async () => {
    if (!uppyRef.current) return
    const queued = files.filter(f => f.status === 'queued' || f.status === 'error')
    if (queued.length === 0) return
    // Retry errored files — remove and re-add is not needed; Uppy retries on next upload() call
    await uppyRef.current.upload()
  }, [files])

  const handleRemove = useCallback((id: string) => {
    uppyRef.current?.removeFile(id)
  }, [])

  const handleClearCompleted = useCallback(() => {
    const done = files.filter(f => f.status === 'success')
    done.forEach(f => uppyRef.current?.removeFile(f.id))
  }, [files])

  // ── Derived state ────────────────────────────────────────────────────

  const hasQueued = files.some(f => f.status === 'queued')
  const hasErrors = files.some(f => f.status === 'error')
  const hasCompleted = files.some(f => f.status === 'success')
  const pendingCount = files.filter(f => f.status === 'queued' || f.status === 'uploading').length
  const canUpload = (hasQueued || hasErrors) && !isUploading

  return (
    <div className="space-y-3">
      {/* Drop zone / file picker */}
      <div
        className={[
          'border-2 border-dashed rounded-[var(--radius-lg)] p-6',
          'flex flex-col items-center justify-center gap-2 text-center',
          'transition-colors duration-[var(--motion-duration-fast)] cursor-pointer',
          'border-[var(--color-border)] hover:border-[var(--color-primary)]/50',
          'bg-[var(--color-bg-base)] hover:bg-[var(--color-accent)]',
        ].join(' ')}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          const dropped = Array.from(e.dataTransfer.files)
          dropped.forEach(file => {
            try {
              uppyRef.current?.addFile({ name: file.name, type: file.type, data: file, source: 'local' })
            } catch (err) {
              console.warn('[VaultUploader] drop addFile rejected:', err)
            }
          })
        }}
        role="button"
        tabIndex={0}
        aria-label="Click or drop files to upload to Vault"
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      >
        <Upload className="w-6 h-6 text-[var(--color-text-muted)]" aria-hidden />
        <div>
          <p className="text-xs font-bold text-[var(--color-text-main)]">Drop files here or click to browse</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
            Max {formatBytes(VAULT_MAX_FILE_SIZE_CLIENT)} per file · All types accepted
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        aria-hidden
        onChange={handleFilePick}
      />

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-bg-base)] border border-[var(--color-border)]"
            >
              {/* Icon */}
              <FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" aria-hidden />

              {/* Name + progress */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--color-text-main)] truncate">{file.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-[var(--color-text-muted)]">{formatBytes(file.size)}</span>
                  {file.status === 'uploading' && (
                    <>
                      <span className="text-[10px] text-[var(--color-text-muted)]">·</span>
                      <span className="text-[10px] font-bold text-[var(--color-primary)]">{file.progress}%</span>
                    </>
                  )}
                  {file.status === 'error' && (
                    <span className="text-[10px] text-[var(--color-overdue)] font-semibold truncate">
                      · {file.error}
                    </span>
                  )}
                </div>
                {file.status === 'uploading' && (
                  <div className="mt-1 w-full h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Status icon */}
              <span className="shrink-0">
                {file.status === 'uploading' && (
                  <Loader2 className="w-3.5 h-3.5 text-[var(--color-primary)] animate-spin" aria-label="Uploading" />
                )}
                {file.status === 'success' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-completed)]" aria-label="Uploaded" />
                )}
                {file.status === 'error' && (
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-overdue)]" aria-label="Failed" />
                )}
              </span>

              {/* Remove / retry */}
              {file.status !== 'uploading' && (
                <button
                  type="button"
                  onClick={() => handleRemove(file.id)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-accent)] transition-colors"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="w-3 h-3" aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      {files.length > 0 && (
        <div className="flex items-center gap-2">
          {canUpload && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpload}
              icon={hasErrors ? <RefreshCw className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
              className="flex-1"
            >
              {hasErrors ? `Retry Failed` : `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
            </Button>
          )}
          {isUploading && (
            <Button variant="outline" size="sm" disabled className="flex-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" aria-hidden />
              Uploading…
            </Button>
          )}
          {hasCompleted && !isUploading && (
            <Button variant="ghost" size="sm" onClick={handleClearCompleted}>
              Clear done
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
