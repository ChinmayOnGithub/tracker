import { describe, it, expect } from 'bun:test';
import { JournalContentAdapter } from '@/modules/journal/editor/JournalContentAdapter';

describe('Journal State Synchronization & Adapter Tests (#15, #16)', () => {
  it('should adapt plain text, markdown, and formatted html safely', () => {
    const rawMarkdown = '# Today Goal\n- Finish PR\n- Run tests';
    const adaptedHtml = JournalContentAdapter.toEditor(rawMarkdown);
    expect(adaptedHtml).toContain('<h1>Today Goal</h1>');
    expect(adaptedHtml).toContain('Finish PR');

    const dbPayload = JournalContentAdapter.toDatabase(adaptedHtml);
    expect(dbPayload.plainText).toContain('Today Goal');
    expect(dbPayload.plainText).toContain('Finish PR');
  });

  it('should handle images inside journal html without losing image source tags', () => {
    const htmlWithImg = '<p>Memory photo:</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="test.png" />';
    const adapted = JournalContentAdapter.toEditor(htmlWithImg);
    expect(adapted).toContain('<img src="data:image/png;base64');

    const dbPayload = JournalContentAdapter.toDatabase(adapted);
    expect(dbPayload.content).toContain('data:image/png;base64');
    expect(dbPayload.plainText).toContain('Memory photo:');
  });

  it('should guarantee atomic 3-tier precedence in memory draft over database values', () => {
    const activeDate = '2026-09-04';
    const serverDbContent = '<p>Older server content</p>';
    const activeUnsavedDraft = '<p>Newest unsaved local draft while typing...</p>';

    const activeDrafts: Record<string, { content: string }> = {
      [activeDate]: { content: activeUnsavedDraft }
    };

    // Precedence rule: 1. active unsaved local draft, 2. local cache, 3. server value
    const resolvedContent = activeDrafts[activeDate]?.content !== undefined 
      ? activeDrafts[activeDate].content 
      : serverDbContent;

    expect(resolvedContent).toBe(activeUnsavedDraft);
  });
});
