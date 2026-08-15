/**
 * Converts Tiptap editor content back to legacy format (HTML) for saving,
 * and extracts clean plain text for search indexing.
 */

export function tiptapToLegacy(html: string): { content: string; plainText: string } {
  if (!html) return { content: '', plainText: '' }

  // Extract plain text by stripping HTML tags
  const plainText = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    content: html,
    plainText,
  }
}
