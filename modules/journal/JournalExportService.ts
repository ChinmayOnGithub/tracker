import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine'
import { JournalEntry } from '@prisma/client'

export interface ExportEntry {
  id: string
  userId: string
  journalDate: string
  content: string
  mood: string | null
  gratitude: string | null
  reflections: string | null
  lessonsLearned: string | null
  tomorrowPlan: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  // Export additions
  rawContent: string
  contentFormat: 'html' | 'markdown' | 'plain-text' | 'unknown'
  plainText: string
  // Conflicts if local/remote versions differ
  localVersion?: Partial<ExportEntry>
  remoteVersion?: Partial<ExportEntry>
}

export interface JournalExportArchive {
  format: 'tracker-journal-archive'
  version: 1
  exportedAt: string
  remoteSourceUnavailable?: boolean
  entries: ExportEntry[]
}

export interface ExportSummary {
  entriesCount: number
  conflictsCount: number
  warningsCount: number
  warnings: string[]
}

export class JournalExportService {
  /**
   * Safe content format detector.
   */
  private static detectFormat(content: string): 'html' | 'markdown' | 'plain-text' | 'unknown' {
    if (!content) return 'plain-text'
    if (/<[a-z][\s\S]*>/i.test(content)) return 'html'
    if (/[#*_~`]/.test(content)) return 'markdown'
    return 'plain-text'
  }

  /**
   * Helper to strip HTML/Markdown to get plain text.
   */
  private static extractPlainText(content: string): string {
    if (!content) return ''
    return content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Safe read-only export function.
   */
  public static async exportArchive(): Promise<{ archive: JournalExportArchive; summary: ExportSummary }> {
    const exportedAt = new Date().toISOString()
    const engine = IndexedDBEngine.getInstance()
    
    // 1. Fetch Local Entries from IndexedDB
    let localRecords: JournalEntry[] = []
    try {
      localRecords = await engine.getAll<JournalEntry>('journal_entries')
    } catch (e) {
      console.error('Failed to get local journal entries:', e)
    }

    // 2. Fetch Remote Entries from Server
    let remoteRecords: JournalEntry[] = []
    let remoteSourceUnavailable = false
    try {
      const { listJournalEntries } = await import('@/app/actions/journal')
      const res = await listJournalEntries(1, 1000000)
      if (res && res.success && res.entries) {
        remoteRecords = res.entries as unknown as JournalEntry[]
      } else {
        remoteSourceUnavailable = true
      }
    } catch (e) {
      remoteSourceUnavailable = true
      console.warn('Remote server journal entries source unavailable:', e)
    }

    const entriesMap = new Map<string, ExportEntry>()
    const warnings: string[] = []
    let conflictsCount = 0

    // Process Local Records
    for (const record of localRecords) {
      if (!record.id) {
        warnings.push(`Local entry missing ID, skipped. Date: ${record.journalDate}`)
        continue
      }
      const raw = record.content || ''
      const format = this.detectFormat(raw)
      const plain = this.extractPlainText(raw)

      entriesMap.set(record.id, {
        id: record.id,
        userId: record.userId || '',
        journalDate: record.journalDate instanceof Date ? record.journalDate.toISOString() : new Date(record.journalDate).toISOString(),
        content: record.content || '',
        mood: record.mood || null,
        gratitude: record.gratitude || null,
        reflections: record.reflections || null,
        lessonsLearned: record.lessonsLearned || null,
        tomorrowPlan: record.tomorrowPlan || null,
        metadata: (record.metadata as Record<string, unknown> | null) || null,
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : new Date(record.createdAt).toISOString(),
        updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : new Date(record.updatedAt).toISOString(),
        deletedAt: record.deletedAt ? (record.deletedAt instanceof Date ? record.deletedAt.toISOString() : new Date(record.deletedAt).toISOString()) : null,
        rawContent: raw,
        contentFormat: format,
        plainText: plain
      })
    }

    // Merge & Process Remote Records
    for (const record of remoteRecords) {
      if (!record.id) {
        warnings.push(`Remote entry missing ID, skipped. Date: ${record.journalDate}`)
        continue
      }
      const raw = record.content || ''
      const format = this.detectFormat(raw)
      const plain = this.extractPlainText(raw)

      const journalDateStr = record.journalDate instanceof Date ? record.journalDate.toISOString() : new Date(record.journalDate).toISOString()
      const createdAtStr = record.createdAt instanceof Date ? record.createdAt.toISOString() : new Date(record.createdAt).toISOString()
      const updatedAtStr = record.updatedAt instanceof Date ? record.updatedAt.toISOString() : new Date(record.updatedAt).toISOString()
      const deletedAtStr = record.deletedAt ? (record.deletedAt instanceof Date ? record.deletedAt.toISOString() : new Date(record.deletedAt).toISOString()) : null

      const remoteEntry: ExportEntry = {
        id: record.id,
        userId: record.userId || '',
        journalDate: journalDateStr,
        content: record.content || '',
        mood: record.mood || null,
        gratitude: record.gratitude || null,
        reflections: record.reflections || null,
        lessonsLearned: record.lessonsLearned || null,
        tomorrowPlan: record.tomorrowPlan || null,
        metadata: (record.metadata as Record<string, unknown> | null) || null,
        createdAt: createdAtStr,
        updatedAt: updatedAtStr,
        deletedAt: deletedAtStr,
        rawContent: raw,
        contentFormat: format,
        plainText: plain
      }

      const existing = entriesMap.get(record.id)
      if (existing) {
        // Compare values to check for conflicts (e.g. content or updatedAt differs)
        const contentDiffers = existing.content !== remoteEntry.content
        const updatedAtDiffers = existing.updatedAt !== remoteEntry.updatedAt
        
        if (contentDiffers || updatedAtDiffers) {
          conflictsCount++
          existing.localVersion = { ...existing }
          existing.remoteVersion = remoteEntry
          // For the main fields, keep the newer version as the main reference
          const isLocalNewer = new Date(existing.updatedAt).getTime() > new Date(remoteEntry.updatedAt).getTime()
          if (!isLocalNewer) {
            Object.assign(existing, remoteEntry)
          }
        }
      } else {
        entriesMap.set(record.id, remoteEntry)
      }
    }

    const entries = Array.from(entriesMap.values())

    return {
      archive: {
        format: 'tracker-journal-archive',
        version: 1,
        exportedAt,
        ...(remoteSourceUnavailable ? { remoteSourceUnavailable } : {}),
        entries
      },
      summary: {
        entriesCount: entries.length,
        conflictsCount,
        warningsCount: warnings.length,
        warnings
      }
    }
  }
}
export default JournalExportService
