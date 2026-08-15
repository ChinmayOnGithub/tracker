/**
 * Tracker notification abstraction.
 *
 * All toast calls in the application go through this module — never call
 * `sonner` directly. This keeps the third-party API behind a single seam
 * so it can be swapped or adapted without touching feature code.
 *
 * Rule: dialogs are still required for destructive confirmation.
 * Toasts are for transient, non-blocking feedback only.
 */
import { toast } from 'sonner'

export const notify = {
  /** Generic success feedback (saved, created, updated). */
  success(message: string, description?: string) {
    toast.success(message, { description })
  },

  /** Generic error feedback (failed action, server error). */
  error(message: string, description?: string) {
    toast.error(message, { description })
  },

  /** Informational / neutral feedback. */
  info(message: string, description?: string) {
    toast.info(message, { description })
  },

  /** Warning — something succeeded but with caveats. */
  warning(message: string, description?: string) {
    toast.warning(message, { description })
  },

  // ── Domain-specific helpers ─────────────────────────────────────────────

  saved(entity = 'Changes') {
    toast.success(`${entity} saved`)
  },

  deleted(entity = 'Item') {
    toast.success(`${entity} deleted`)
  },

  syncComplete() {
    toast.success('Synced', { description: 'All changes pushed to server' })
  },

  syncFailed(detail?: string) {
    toast.error('Sync failed', {
      description: detail ?? 'Changes are queued and will retry automatically',
    })
  },

  exported(entity = 'File') {
    toast.success(`${entity} exported`)
  },

  imported(entity = 'Data') {
    toast.success(`${entity} imported successfully`)
  },

  uploaded(fileName?: string) {
    toast.success(fileName ? `"${fileName}" uploaded` : 'File uploaded')
  },

  uploadFailed(fileName?: string) {
    toast.error(fileName ? `Failed to upload "${fileName}"` : 'Upload failed')
  },

  restoreComplete() {
    toast.success('Backup restored', { description: 'Your data has been restored' })
  },

  taskUpdated() {
    toast.success('Task updated')
  },

  journalSaved() {
    toast.success('Journal entry saved')
  },

  offlineQueued() {
    toast.info('Saved offline', {
      description: 'Will sync automatically when back online',
    })
  },
}
