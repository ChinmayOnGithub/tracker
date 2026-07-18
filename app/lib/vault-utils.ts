// Helper functions for Vault module – not server actions
export async function normalizeSearchName(filename: string): Promise<string> {
  return filename
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
}

export async function resolveMimeGroup(mime: string): Promise<string> {
  if (!mime) return 'OTHER'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('image/')) return 'IMAGE'
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'VIDEO'
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip') || mime.includes('compress')) return 'ARCHIVE'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'SPREADSHEET'
  if (mime.includes('document') || mime.includes('msword') || mime.startsWith('text/')) return 'TEXT'
  if (mime.includes('javascript') || mime.includes('json') || mime.includes('xml') || mime.includes('html') || mime.includes('css') || mime.includes('typescript') || mime.includes('python') || mime.includes('java')) return 'CODE'
  return 'OTHER'
}

export async function resolveExtension(filename: string): Promise<string> {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}
