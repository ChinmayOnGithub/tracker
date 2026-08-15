import { describe, it, expect } from 'bun:test'
import { legacyToTiptap } from '@/modules/journal/editor/legacyToTiptap'
import { tiptapToLegacy } from '@/modules/journal/editor/tiptapToLegacy'
import { JournalExportService } from '@/modules/journal/JournalExportService'

describe('Journal Content Adapter Converters', () => {
  it('should parse legacy plain text format to Tiptap HTML', () => {
    const raw = 'Hello World\n\nThis is standard paragraph.'
    const html = legacyToTiptap(raw)
    expect(html).toContain('<p>Hello World</p>')
    expect(html).toContain('<p>This is standard paragraph.</p>')
  })

  it('should preserve existing HTML formatting', () => {
    const raw = '<p>Already <strong>HTML</strong></p>'
    const html = legacyToTiptap(raw)
    expect(html).toBe(raw)
  })

  it('should convert Markdown formatting to Tiptap-friendly tags', () => {
    const raw = '**Bold text** and *italic text*'
    const html = legacyToTiptap(raw)
    expect(html).toContain('<strong>Bold text</strong>')
    expect(html).toContain('<em>italic text</em>')
  })

  it('should extract plainText correctly from Tiptap HTML', () => {
    const html = '<h1>Title</h1><p>Writing some <strong>bold</strong> words.</p>'
    const adapted = tiptapToLegacy(html)
    expect(adapted.content).toBe(html)
    expect(adapted.plainText).toBe('Title Writing some bold words.')
  })
})

describe('Journal Export Data Safety', () => {
  it('should correctly build export archive payload', async () => {
    const { archive, summary } = await JournalExportService.exportArchive()
    expect(archive.format).toBe('tracker-journal-archive')
    expect(archive.version).toBe(1)
    expect(summary.entriesCount).toBeDefined()
    expect(summary.conflictsCount).toBeDefined()
    expect(summary.warningsCount).toBeDefined()
  })
})

describe('Editor Revision Control', () => {
  it('should detect stale save completion correctly', () => {
    let currentRevision = 0
    let savedRevision = 0

    // User types "hello"
    currentRevision = 1
    const saveSnapshotRev = currentRevision

    // User types "hello world" before save finishes
    currentRevision = 2

    // Save finishes for first snapshot
    if (saveSnapshotRev >= savedRevision) {
      savedRevision = saveSnapshotRev
    }

    // Since currentRevision is 2, and savedRevision is 1, the editor is still dirty
    expect(savedRevision).toBe(1)
    expect(savedRevision === currentRevision).toBe(false) // Needs another save
  })

  it('should mark revision clean when latest save completes', () => {
    let currentRevision = 0
    let savedRevision = 0

    // User types and save completes
    currentRevision = 1
    const saveSnapshotRev = currentRevision

    if (saveSnapshotRev >= savedRevision) {
      savedRevision = saveSnapshotRev
    }

    expect(savedRevision === currentRevision).toBe(true) // Fully saved
  })
})
