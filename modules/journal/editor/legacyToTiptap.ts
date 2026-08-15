/**
 * Convert legacy Journal entry content to Tiptap-compatible HTML.
 * Handles plain text, markdown, and partially formatted HTML formats safely.
 */
export function legacyToTiptap(content: string | null | undefined): string {
  if (!content) return '<p></p>'

  const trimmed = content.trim()
  if (trimmed === '') return '<p></p>'

  // If it's already HTML (contains HTML tags), return it directly to let Tiptap parse it
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed
  }

  // Handle simple Markdown conversions to HTML
  let html = trimmed
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^-\s+(.+)$/gm, '<ul><li>$1</li></ul>')

  // Cleanup lists
  html = html.replace(/<\/ul>\s*<ul>/g, '')

  // If there are no HTML tags at all, wrap double newlines in paragraphs
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html
      .split(/\n{2,}/)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  return html
}
