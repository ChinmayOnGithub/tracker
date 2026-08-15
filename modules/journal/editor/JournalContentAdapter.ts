import { legacyToTiptap } from './legacyToTiptap'
import { tiptapToLegacy } from './tiptapToLegacy'

export class JournalContentAdapter {
  /**
   * Adapts legacy database content into Tiptap-friendly HTML.
   */
  public static toEditor(content: string | null | undefined): string {
    return legacyToTiptap(content)
  }

  /**
   * Adapts active editor HTML content to saved database content.
   */
  public static toDatabase(html: string): { content: string; plainText: string } {
    return tiptapToLegacy(html)
  }
}
