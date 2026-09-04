import { ActivityTemplate, Note } from '@/types'
import { JournalEntry, WeightRecord, LeaveRecord, VaultItem, LinkItem, LinkCollection } from '@/lib/store/store'
import { toYMD, fmtDateMed } from '@/lib/dateUtils'

export type SearchCategory =
  | 'all'
  | 'journal'
  | 'note'
  | 'activity'
  | 'link'
  | 'document'
  | 'weight'
  | 'leave'
  | 'settings'

export interface SearchResult {
  id: string
  type: 'journal' | 'note' | 'activity' | 'link' | 'document' | 'weight' | 'leave' | 'settings'
  title: string
  subtitle?: string
  snippet?: string
  metadata?: string
  href: string
  score: number
  payload?: {
    date?: string
    noteId?: string
    activityId?: string
    linkId?: string
    collectionId?: string | null
    documentId?: string
    folderId?: string | null
    tab?: string
    url?: string
    externalUrl?: string
  }
}

export interface SearchableDataset {
  notes?: Note[]
  journalEntries?: JournalEntry[]
  templates?: ActivityTemplate[]
  links?: LinkItem[]
  collections?: LinkCollection[]
  vaultItems?: VaultItem[]
  weightRecords?: WeightRecord[]
  leaveRecords?: LeaveRecord[]
}

export interface SettingsCommand {
  id: string
  label: string
  tab: string
  keywords: string
  description?: string
}

export const SETTINGS_COMMANDS: SettingsCommand[] = [
  {
    id: 'settings-profile',
    label: 'Profile & Account Settings',
    tab: 'profile',
    keywords: 'profile account username email timezone country birthday date time format pin passcode password authentication credentials',
    description: 'Manage username, email, timezones, and passcode protection'
  },
  {
    id: 'settings-appearance',
    label: 'Appearance & Theme',
    tab: 'appearance',
    keywords: 'appearance theme colors accent font size dark light mode rounded corners styling personal customize aesthetic display',
    description: 'Customize colors, dark mode, font sizes, and card rounding'
  },
  {
    id: 'settings-calendar',
    label: 'Calendar & Working Hours',
    tab: 'calendar',
    keywords: 'calendar schedule events working hours weekly goal start day agenda time off',
    description: 'Configure working hours and default calendar views'
  },
  {
    id: 'settings-dashboard',
    label: 'Dashboard Widgets',
    tab: 'dashboard',
    keywords: 'dashboard widgets reorder layout customize toggle cards metrics hide show',
    description: 'Customize layout and toggle widget visibility'
  },
  {
    id: 'settings-notifications',
    label: 'Notifications & Alerts',
    tab: 'notifications',
    keywords: 'notifications alerts reminders daily digest sounds badges web push telegram email',
    description: 'Set up reminders and daily activity alerts'
  },
  {
    id: 'settings-integrations',
    label: 'Google Calendar Integration',
    tab: 'integrations',
    keywords: 'integrations google calendar sync connect oauth api refresh disconnect external',
    description: 'Connect or disconnect Google Calendar account'
  },
  {
    id: 'settings-security',
    label: 'Security & Access Control',
    tab: 'security',
    keywords: 'security access control pin permissions passcode guest shared lock privacy vault encryption',
    description: 'Configure passcode lock and guest role permissions'
  },
  {
    id: 'settings-backup',
    label: 'Backup & Recovery',
    tab: 'backup',
    keywords: 'backup export import json zip snapshot restore data download sync archive database',
    description: 'Export all Tracker data as JSON or restore from backup'
  },
  {
    id: 'settings-admin',
    label: 'Admin & Guest Permissions',
    tab: 'admin',
    keywords: 'admin guest permissions access modules visibility roles authorization users',
    description: 'Manage permissions and visibility for guest accounts'
  },
  {
    id: 'settings-advanced',
    label: 'Advanced & Offline Diagnostics',
    tab: 'advanced',
    keywords: 'advanced offline diagnostics indexeddb reset clear cache sync logs debug memory storage quota',
    description: 'Inspect local storage, IndexedDB health, and sync queue'
  },
  {
    id: 'settings-leave',
    label: 'Leave Allowances Configuration',
    tab: 'leave',
    keywords: 'leave allowance vacation sick casual time off pto quota days balance config',
    description: 'Configure annual leave quotas and balances'
  }
]

export function stripHtml(html: string): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Tokenizes a query string into lowercase non-empty words
 */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 0)
}

/**
 * Calculates a match score for a given item based on fields
 */
export function computeMatchScore(
  tokens: string[],
  rawQuery: string,
  fields: {
    title?: string | null
    keywords?: string | null
    metadata?: string | null
    content?: string | null
    url?: string | null
  }
): { matched: boolean; score: number; snippet?: string } {
  if (tokens.length === 0) {
    return { matched: true, score: 0 }
  }

  const q = rawQuery.toLowerCase().trim()
  const title = (fields.title || '').toLowerCase()
  const keywords = (fields.keywords || '').toLowerCase()
  const metadata = (fields.metadata || '').toLowerCase()
  const content = (fields.content || '').toLowerCase()
  const url = (fields.url || '').toLowerCase()

  const allText = `${title} ${keywords} ${metadata} ${content} ${url}`

  // Every token must appear somewhere across all fields
  const allTokensMatch = tokens.every(token => allText.includes(token))
  if (!allTokensMatch) {
    return { matched: false, score: 0 }
  }

  let score = 0

  // 1. Exact Title Matches
  if (title === q) {
    score += 120
  } else if (title.startsWith(q)) {
    score += 90
  } else if (title.includes(q)) {
    score += 70
  } else {
    // Check how many tokens match directly in the title
    const titleTokenCount = tokens.filter(t => title.includes(t)).length
    score += titleTokenCount * 25
  }

  // 2. Keywords / Tab Match
  if (keywords.includes(q)) {
    score += 40
  }

  // 3. Metadata / Recurrence / Tags / Category Match
  if (metadata.includes(q)) {
    score += 35
  }

  // 4. Content / Snippet Match
  if (content.includes(q)) {
    score += 25
  }

  // 5. URL Match
  if (url.includes(q)) {
    score += 30
  }

  // Build snippet excerpt around match
  let snippet: string | undefined
  if (content) {
    const idx = content.indexOf(tokens[0])
    if (idx !== -1) {
      const start = Math.max(0, idx - 40)
      const end = Math.min(fields.content!.length, idx + 80)
      snippet = (start > 0 ? '…' : '') + fields.content!.slice(start, end).trim() + (end < fields.content!.length ? '…' : '')
    } else {
      snippet = fields.content!.slice(0, 100).trim() + (fields.content!.length > 100 ? '…' : '')
    }
  }

  return { matched: true, score, snippet }
}

export class MasterSearchEngine {
  /**
   * Universal search across all Tracker datasets
   */
  public static search(
    query: string,
    dataset: SearchableDataset,
    categoryFilter: SearchCategory = 'all'
  ): SearchResult[] {
    const rawQuery = query.trim()
    if (!rawQuery) {
      return []
    }

    const tokens = tokenize(rawQuery)
    const results: SearchResult[] = []

    // 1. NOTES
    if ((categoryFilter === 'all' || categoryFilter === 'note') && dataset.notes) {
      for (const note of dataset.notes) {
        const plainContent = stripHtml(note.content || '')
        const title = note.title?.trim() || 'Untitled Note'
        const match = computeMatchScore(tokens, rawQuery, {
          title,
          content: plainContent,
          metadata: `note ${note.date || ''}`
        })

        if (match.matched) {
          results.push({
            id: `note-${note.id}`,
            type: 'note',
            title,
            subtitle: note.date ? `Note · ${note.date}` : 'Note',
            snippet: match.snippet || plainContent.slice(0, 90),
            metadata: 'NOTES',
            href: `/notes?id=${note.id}`,
            score: match.score,
            payload: {
              noteId: note.id,
              date: note.date
            }
          })
        }
      }
    }

    // 2. JOURNAL ENTRIES
    if ((categoryFilter === 'all' || categoryFilter === 'journal') && dataset.journalEntries) {
      for (const entry of dataset.journalEntries) {
        const dateStr = typeof entry.journalDate === 'string'
          ? entry.journalDate.split('T')[0]
          : toYMD(entry.journalDate)
        const dateFormatted = fmtDateMed(entry.journalDate)
        const plainContent = stripHtml(entry.content || '')
        const moodText = entry.mood ? `Mood: ${entry.mood}` : ''
        const gratitudeText = entry.gratitude ? `Gratitude: ${entry.gratitude}` : ''
        const reflectionText = entry.reflections ? `Reflections: ${entry.reflections}` : ''
        const combinedContent = `${plainContent} ${moodText} ${gratitudeText} ${reflectionText}`.trim()

        const match = computeMatchScore(tokens, rawQuery, {
          title: dateFormatted,
          keywords: `${dateStr} ${entry.mood || ''}`,
          metadata: `journal ${entry.mood || ''} gratitude reflection`,
          content: combinedContent
        })

        if (match.matched) {
          results.push({
            id: `journal-${entry.id}`,
            type: 'journal',
            title: dateFormatted,
            subtitle: entry.mood ? `Journal · Mood: ${entry.mood}` : 'Journal Entry',
            snippet: match.snippet || plainContent.slice(0, 90),
            metadata: 'JOURNAL',
            href: `/journal?date=${dateStr}`,
            score: match.score,
            payload: {
              date: dateStr
            }
          })
        }
      }
    }

    // 3. ACTIVITIES & TEMPLATES
    if ((categoryFilter === 'all' || categoryFilter === 'activity') && dataset.templates) {
      for (const template of dataset.templates) {
        // Search name, category, description/notes, type, tags, recurrence
        const tagsStr = (template as unknown as { tags?: Array<{ name: string }> }).tags
          ?.map(t => t.name)
          .join(' ') || ''
        const metaStr = `${template.category || ''} ${template.recurrenceType || ''} ${template.type || ''} ${tagsStr}`

        const match = computeMatchScore(tokens, rawQuery, {
          title: template.name,
          keywords: `${template.category || ''} ${template.type || ''}`,
          metadata: metaStr,
          content: template.notes || null
        })

        if (match.matched) {
          results.push({
            id: `activity-${template.id}`,
            type: 'activity',
            title: template.name,
            subtitle: `${template.category || 'General'} · ${template.recurrenceType || 'Daily'}`,
            snippet: template.notes || (tagsStr ? `Tags: ${tagsStr}` : undefined),
            metadata: 'ACTIVITIES',
            href: `/activities?id=${template.id}`,
            score: match.score,
            payload: {
              activityId: template.id
            }
          })
        }
      }
    }

    // 4. LINKS & BOOKMARKS
    if ((categoryFilter === 'all' || categoryFilter === 'link') && dataset.links) {
      const collectionMap = new Map<string, string>()
      if (dataset.collections) {
        dataset.collections.forEach(c => collectionMap.set(c.id, c.name))
      }

      for (const link of dataset.links) {
        const colName = link.collectionId ? collectionMap.get(link.collectionId) : null
        let hostname = ''
        try {
          hostname = new URL(link.url).hostname.replace(/^www\./, '')
        } catch {
          hostname = link.url
        }

        const match = computeMatchScore(tokens, rawQuery, {
          title: link.title || hostname,
          url: `${link.url} ${hostname}`,
          metadata: colName ? `collection:${colName} bookmarks` : 'links bookmarks',
          content: link.description || null
        })

        if (match.matched) {
          results.push({
            id: `link-${link.id}`,
            type: 'link',
            title: link.title || hostname,
            subtitle: colName ? `${colName} · ${hostname}` : hostname,
            snippet: link.description || link.url,
            metadata: 'LINKS',
            href: `/links?id=${link.id}${link.collectionId ? `&colId=${link.collectionId}` : ''}`,
            score: match.score,
            payload: {
              linkId: link.id,
              collectionId: link.collectionId,
              url: link.url,
              externalUrl: link.url
            }
          })
        }
      }
    }

    // 5. VAULT / DOCUMENTS (Safe metadata only; zero binary or decrypted secrets)
    if ((categoryFilter === 'all' || categoryFilter === 'document') && dataset.vaultItems) {
      for (const item of dataset.vaultItems) {
        const itemCategory = (item as unknown as { metadata?: { category?: string } }).metadata?.category || ''
        const mime = item.mimeGroup || (item.isFolder ? 'Folder' : 'File')

        const match = computeMatchScore(tokens, rawQuery, {
          title: item.name,
          keywords: `${mime} ${itemCategory}`,
          metadata: `vault document ${itemCategory} ${mime} ${item.isFolder ? 'folder' : ''}`,
          content: null
        })

        if (match.matched) {
          results.push({
            id: `vault-${item.id}`,
            type: 'document',
            title: item.name,
            subtitle: item.isFolder ? 'Folder · Secure Vault' : `${mime} · ${itemCategory || 'Secure Vault'}`,
            snippet: item.isFolder ? 'Folder' : `File in ${itemCategory || 'Vault'}`,
            metadata: 'DOCUMENTS',
            href: `/documents?id=${item.id}${item.parentId ? `&folderId=${item.parentId}` : ''}`,
            score: match.score,
            payload: {
              documentId: item.id,
              folderId: item.parentId
            }
          })
        }
      }
    }

    // 6. WEIGHT RECORDS
    if ((categoryFilter === 'all' || categoryFilter === 'weight') && dataset.weightRecords) {
      for (const record of dataset.weightRecords) {
        const dateStr = typeof record.date === 'string' ? record.date.split('T')[0] : toYMD(record.date)
        const dateFormatted = fmtDateMed(record.date)

        const match = computeMatchScore(tokens, rawQuery, {
          title: `${record.weight} kg`,
          keywords: `${dateStr} scale weight fitness health`,
          metadata: `weight ${dateFormatted}`,
          content: record.notes || null
        })

        if (match.matched) {
          results.push({
            id: `weight-${record.id}`,
            type: 'weight',
            title: `${record.weight} kg`,
            subtitle: `Weight Record · ${dateFormatted}`,
            snippet: record.notes || `${record.weight} kg logged on ${dateStr}`,
            metadata: 'WEIGHT',
            href: `/weight`,
            score: match.score,
            payload: {
              date: dateStr
            }
          })
        }
      }
    }

    // 7. LEAVE RECORDS
    if ((categoryFilter === 'all' || categoryFilter === 'leave') && dataset.leaveRecords) {
      for (const record of dataset.leaveRecords) {
        const start = typeof record.startDate === 'string' ? record.startDate.split('T')[0] : toYMD(record.startDate)
        const end = typeof record.endDate === 'string' ? record.endDate.split('T')[0] : toYMD(record.endDate)

        const match = computeMatchScore(tokens, rawQuery, {
          title: `${record.leaveType} (${record.totalDays}d)`,
          keywords: `${record.status} vacation time off pto sick holiday ${start} ${end}`,
          metadata: `leave ${record.status} ${start} to ${end}`,
          content: record.notes || null
        })

        if (match.matched) {
          results.push({
            id: `leave-${record.id}`,
            type: 'leave',
            title: `${record.leaveType.toUpperCase()} (${record.totalDays} days)`,
            subtitle: `Time Off · ${record.status.toUpperCase()} · ${start} to ${end}`,
            snippet: record.notes || `${start} to ${end} · Status: ${record.status}`,
            metadata: 'LEAVE',
            href: `/leave`,
            score: match.score,
            payload: {
              date: start
            }
          })
        }
      }
    }

    // 8. SETTINGS COMMANDS
    if (categoryFilter === 'all' || categoryFilter === 'settings') {
      for (const cmd of SETTINGS_COMMANDS) {
        const match = computeMatchScore(tokens, rawQuery, {
          title: cmd.label,
          keywords: `${cmd.keywords} ${cmd.tab}`,
          metadata: `settings preferences ${cmd.tab}`,
          content: cmd.description || null
        })

        if (match.matched) {
          results.push({
            id: `settings-${cmd.id}`,
            type: 'settings',
            title: cmd.label,
            subtitle: `Settings · ${cmd.tab.toUpperCase()}`,
            snippet: cmd.description,
            metadata: 'SETTINGS',
            href: `/settings?tab=${cmd.tab}`,
            score: match.score,
            payload: {
              tab: cmd.tab
            }
          })
        }
      }
    }

    // Sort descending by score, then alphabetically by title
    return results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.title.localeCompare(b.title)
    })
  }
}
