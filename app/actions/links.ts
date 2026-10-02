"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { Prisma, SavedLink } from '@prisma/client'
import { requireAuth, requireOwnership, requireModuleAccess } from '@/lib/auth-guards'

// ─── Collections ─────────────────────────────────────────────────────────────

export async function listLinkCollections() {
  try {
    const user = await requireModuleAccess('links')
    const collections = await db.linkCollection.findMany({
      where: { userId: user.id, deletedAt: null },
      include: {
        links: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    })
    return { success: true, collections }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message, collections: [] }
  }
}

export async function createLinkCollection(name: string, color?: string, icon?: string | null) {
  try {
    const user = await requireModuleAccess('links')
    const count = await db.linkCollection.count({ where: { userId: user.id, deletedAt: null } })
    const collection = await db.linkCollection.create({
      data: { userId: user.id, name, color: color ?? '#6366f1', icon: icon || null, sortOrder: count },
    })
    revalidatePath('/')
    return { success: true, collection }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function updateLinkCollection(id: string, data: { name?: string; color?: string; icon?: string | null }) {
  try {
    const { user } = await requireOwnership('linkCollection', id)
    const { count } = await db.linkCollection.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data
    })
    if (count === 0) return { success: false, error: 'Collection not found' }
    const updated = await db.linkCollection.findUnique({ where: { id } })
    revalidatePath('/')
    return { success: true, collection: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteLinkCollection(id: string) {
  try {
    const { user } = await requireOwnership('linkCollection', id)
    const { count } = await db.linkCollection.updateMany({
      where: { id, userId: user.id, deletedAt: null },
      data: { deletedAt: new Date() }
    })
    if (count === 0) return { success: false, error: 'Collection not found' }
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ─── Links ────────────────────────────────────────────────────────────────────

import dns from 'dns/promises'
import net from 'net'

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4) return true
    const [b0, b1] = parts
    if (b0 === 0) return true
    if (b0 === 10) return true
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true
    if (b0 === 127) return true
    if (b0 === 169 && b1 === 254) return true
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true
    if (b0 === 192 && b1 === 0) return true
    if (b0 === 192 && b1 === 168) return true
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true
    if (b0 === 198 && b1 === 51) return true
    if (b0 === 203 && b1 === 0) return true
    if (b0 >= 224) return true
    return false
  } else if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    if (normalized === '::1' || normalized === '::') return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
    if (normalized.startsWith('ff')) return true
    if (normalized.includes('::ffff:')) {
      const ipv4Part = normalized.split('::ffff:')[1]
      if (ipv4Part && net.isIPv4(ipv4Part)) {
        return isPrivateIp(ipv4Part)
      }
      return true
    }
    return false
  }
  return true
}

async function validateSafePublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS protocols are allowed')
  }

  const hostname = url.hostname.toLowerCase().trim()
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Access to local/private addresses is restricted')
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Access to local/private IP addresses is restricted')
    }
    return
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true })
    if (!addresses || addresses.length === 0) {
      throw new Error('Could not resolve destination hostname')
    }
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        throw new Error('Destination host resolves to a private or restricted address')
      }
    }
  } catch (dnsErr) {
    if (dnsErr instanceof Error && dnsErr.message.includes('restricted')) {
      throw dnsErr
    }
    throw new Error('Failed to verify destination address')
  }
}

async function fetchSafeUrl(initialUrl: URL, maxRedirects = 3): Promise<Response> {
  let currentUrl = initialUrl
  let redirectsCount = 0

  while (redirectsCount <= maxRedirects) {
    await validateSafePublicUrl(currentUrl)

    const response = await fetch(currentUrl.toString(), {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectsCount++
      const location = response.headers.get('location')
      if (!location) {
        throw new Error('Redirect missing location header')
      }
      currentUrl = new URL(location, currentUrl)
      continue
    }

    return response
  }

  throw new Error('Too many redirects')
}

async function scrapeMetadata(urlString: string) {
  try {
    let targetUrl: URL
    const cleaned = urlString.trim()
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      targetUrl = new URL('https://' + cleaned)
    } else {
      targetUrl = new URL(cleaned)
    }

    const response = await fetchSafeUrl(targetUrl)

    if (!response.ok) {
      console.warn(`Server scrape failed for URL: ${targetUrl}. Status: ${response.status}`);
      return {
        title: targetUrl.hostname,
        description: null,
        favicon: `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`,
        thumbnail: null,
      }
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return {
        title: targetUrl.pathname.split('/').pop() || targetUrl.hostname,
        description: `Direct link to ${contentType.split(';')[0]} file.`,
        favicon: `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`,
        thumbnail: contentType.startsWith('image/') ? targetUrl.toString() : null,
      }
    }

    // Enforce maximum response body size (512 KB) to prevent memory exhaustion / DoS (#145)
    const MAX_METADATA_BYTES = 512 * 1024
    let html = ''
    if (response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: false })
      let bytesReceived = 0

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            bytesReceived += value.byteLength
            html += decoder.decode(value, { stream: true })
            if (bytesReceived >= MAX_METADATA_BYTES || html.toLowerCase().includes('</head>')) {
              await reader.cancel()
              break
            }
          }
        }
      } catch {
        // Stream reading completed or cancelled
      }
    } else {
      html = await response.text()
    }

    // Extract head section to parse efficiently
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
    const headHtml = headMatch ? headMatch[1] : html

    const metaTags: Record<string, string> = {}

    // Extract all <meta> tags
    const metaRegex = /<meta\s+([^>]*)\/?>/gi
    let match
    while ((match = metaRegex.exec(headHtml)) !== null) {
      const attrs = match[1]
      const nameMatch = attrs.match(/name=["']([\s\S]*?)["']/i)
      const propMatch = attrs.match(/property=["']([\s\S]*?)["']/i)
      const contentMatch = attrs.match(/content=["']([\s\S]*?)["']/i)

      const key = nameMatch ? nameMatch[1].toLowerCase() : (propMatch ? propMatch[1].toLowerCase() : null)
      const val = contentMatch ? contentMatch[1] : null

      if (key && val) {
        metaTags[key] = val
      }
    }

    // Extract <title> tag
    let pageTitle = ''
    const titleMatch = headHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch && titleMatch[1]) {
      pageTitle = titleMatch[1].trim()
    }

    // Extract favicon <link> tag
    let favicon = ''
    const linkRegex = /<link\s+([^>]*)\/?>/gi
    while ((match = linkRegex.exec(headHtml)) !== null) {
      const attrs = match[1]
      const relMatch = attrs.match(/rel=["']([\s\S]*?)["']/i)
      const hrefMatch = attrs.match(/href=["']([\s\S]*?)["']/i)
      
      if (relMatch && hrefMatch) {
        const rel = relMatch[1].toLowerCase()
        const href = hrefMatch[1]
        if (rel.includes('icon')) {
          favicon = href
          break
        }
      }
    }

    // Clean favicon URL
    try {
      const origin = new URL(targetUrl.toString()).origin
      if (favicon && !favicon.startsWith('http')) {
        favicon = new URL(favicon, origin).toString()
      }
    } catch {
      favicon = ''
    }

    if (!favicon) {
      favicon = `https://www.google.com/s2/favicons?domain=${targetUrl.hostname}&sz=64`
    }

    // Apply strict priority order for unfurling
    const finalTitle = metaTags['og:title'] || 
                       metaTags['twitter:title'] || 
                       pageTitle || 
                       targetUrl.hostname

    const finalDescription = metaTags['og:description'] || 
                             metaTags['twitter:description'] || 
                             metaTags['description'] || 
                             null

    let finalThumbnail = metaTags['og:image'] || 
                         metaTags['twitter:image'] || 
                         metaTags['og:image:url'] ||
                         null

    // Accent color extraction (dominant color)
    let accentColor: string | null = null
    const tcMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']theme-color["']/i)
    if (tcMatch && tcMatch[1]) {
      accentColor = tcMatch[1].trim()
    }

    // Clean thumbnail URL
    try {
      const origin = new URL(targetUrl.toString()).origin
      if (finalThumbnail && !finalThumbnail.startsWith('http')) {
        finalThumbnail = new URL(finalThumbnail, origin).toString()
      }
    } catch {
      finalThumbnail = null
    }

    const decode = (s: string) => s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      title: decode(finalTitle),
      description: finalDescription ? decode(finalDescription) : null,
      favicon: favicon || null,
      thumbnail: finalThumbnail || null,
      accentColor,
    }
  } catch (err) {
    console.error('Metadata scrape error:', err)
    let host = 'Link'
    try {
      host = new URL(urlString.startsWith('http') ? urlString : 'https://' + urlString).hostname
    } catch {}
    return {
      title: host,
      description: null,
      favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
      thumbnail: null,
      accentColor: null,
    }
  }
}

export async function createLink(
  collectionId: string,
  data: {
    url: string
    title?: string
    description?: string | null
    favicon?: string | null
    thumbnail?: string | null
    notes?: string | null
    tags?: string[]
    isPrivate?: boolean
  }
) {
  try {
    await requireModuleAccess('links')
    const { user } = await requireOwnership('linkCollection', collectionId)

    let finalUrl = data.url.trim()
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl
    }

    const scraped = await scrapeMetadata(finalUrl)
    const title = data.title?.trim() || scraped.title
    const description = data.description?.trim() || scraped.description
    const favicon = data.favicon?.trim() || scraped.favicon
    const thumbnail = data.thumbnail?.trim() || scraped.thumbnail
    const accentColor = scraped.accentColor || null

    const count = await db.savedLink.count({ where: { collectionId, deletedAt: null } })
    const link = await db.savedLink.create({
      data: {
        collectionId,
        url: finalUrl,
        title,
        description,
        favicon,
        thumbnail,
        accentColor,
        isPrivate: data.isPrivate ?? false,
        notes: data.notes || null,
        sortOrder: count,
        tags: data.tags && data.tags.length > 0 ? {
          connectOrCreate: data.tags.map(tagName => ({
            where: {
              userId_name: {
                userId: user.id,
                name: tagName.trim()
              }
            },
            create: {
              userId: user.id,
              name: tagName.trim()
            }
          }))
        } : undefined
      },
      include: {
        tags: true
      }
    })
    revalidatePath('/')
    return { success: true, link }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function updateLink(
  id: string,
  data: {
    title?: string
    description?: string | null
    url?: string
    favicon?: string | null
    thumbnail?: string | null
    collectionId?: string
    isPinned?: boolean
    isPrivate?: boolean
    isArchived?: boolean
    notes?: string | null
    tags?: string[]
  }
) {
  try {
    const { user } = await requireOwnership('savedLink', id)

    const { tags, ...scalarData } = data
    const updatedData: Prisma.SavedLinkUpdateInput = { ...scalarData }

    if (tags !== undefined) {
      updatedData.tags = {
        set: [],
        connectOrCreate: tags.map(tagName => ({
          where: {
            userId_name: {
              userId: user.id,
              name: tagName.trim()
            }
          },
          create: {
            userId: user.id,
            name: tagName.trim()
          }
        }))
      }
    }

    const updated = await db.savedLink.update({ 
      where: { id }, 
      data: updatedData,
      include: { tags: true }
    })
    revalidatePath('/')
    return { success: true, link: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function togglePinLink(id: string) {
  try {
    const { record: link } = await requireOwnership('savedLink', id)
    const updated = await db.savedLink.update({
      where: { id },
      data: { isPinned: !link.isPinned },
      include: { tags: true }
    })
    revalidatePath('/')
    return { success: true, link: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function togglePrivateLink(id: string) {
  try {
    const { record: link } = await requireOwnership('savedLink', id)
    const updated = await db.savedLink.update({
      where: { id },
      data: { isPrivate: !link.isPrivate },
      include: { tags: true }
    })
    revalidatePath('/')
    return { success: true, link: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function toggleArchiveLink(id: string) {
  try {
    const { record: link } = await requireOwnership('savedLink', id)
    const updated = await db.savedLink.update({
      where: { id },
      data: { isArchived: !link.isArchived },
      include: { tags: true }
    })
    revalidatePath('/')
    return { success: true, link: updated }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function checkDuplicateLink(url: string) {
  try {
    const user = await requireAuth()
    const cleaned = url.trim().replace(/\/$/, '')
    const existing = await db.savedLink.findFirst({
      where: {
        url: {
          startsWith: cleaned
        },
        collection: {
          userId: user.id
        },
        deletedAt: null
      },
      include: {
        collection: true
      }
    })
    if (existing) {
      return {
        exists: true,
        link: {
          id: existing.id,
          title: existing.title,
          url: existing.url,
          collectionId: existing.collectionId,
          collectionName: existing.collection.name
        }
      }
    }
    return { exists: false }
  } catch {
    return { exists: false }
  }
}

export async function registerLinkVisit(id: string) {
  try {
    await requireOwnership<SavedLink>('savedLink', id)
    const updated = await db.savedLink.update({
      where: { id },
      data: {
        openCount: { increment: 1 },
        lastOpenedAt: new Date()
      }
    })
    revalidatePath('/')
    return { success: true, openCount: updated.openCount, lastOpenedAt: updated.lastOpenedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function createLinkTag(name: string, color?: string) {
  try {
    const user = await requireAuth()
    const tag = await db.linkTag.upsert({
      where: {
        userId_name: {
          userId: user.id,
          name: name.trim()
        }
      },
      update: {
        color: color || '#6366f1'
      },
      create: {
        userId: user.id,
        name: name.trim(),
        color: color || '#6366f1'
      }
    })
    return { success: true, tag }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function deleteLinkTag(id: string) {
  try {
    const { user } = await requireOwnership('linkTag', id)
    const { count } = await db.linkTag.deleteMany({
      where: { id, userId: user.id }
    })
    if (count === 0) return { success: false, error: 'Tag not found' }
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export async function getLinkTags() {
  try {
    const user = await requireAuth()
    const tags = await db.linkTag.findMany({
      where: { userId: user.id },
      orderBy: { name: 'asc' }
    })
    return { success: true, tags }
  } catch {
    return { success: false, tags: [] }
  }
}

export async function deleteLink(id: string) {
  try {
    await requireOwnership('savedLink', id)
    const { count } = await db.savedLink.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() }
    })
    if (count === 0) return { success: false, error: 'Link not found' }
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
