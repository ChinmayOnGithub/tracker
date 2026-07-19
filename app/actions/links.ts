"use server"

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { requireAuth, requireOwnership } from '@/lib/auth-guards'

// ─── Collections ─────────────────────────────────────────────────────────────

export async function listLinkCollections() {
  try {
    const user = await requireAuth()
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
    const user = await requireAuth()
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
    const updated = await db.linkCollection.update({ where: { id }, data })
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
    await db.linkCollection.update({ where: { id }, data: { deletedAt: new Date() } })
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ─── Links ────────────────────────────────────────────────────────────────────

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true
  }
  if (/^10\./.test(host)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^169\.254\./.test(host)) return true
  return false
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

    if (isPrivateOrLocalHost(targetUrl.hostname)) {
      throw new Error('Access to local/private addresses is restricted')
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(8000),
    })

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

    const html = await response.text()

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
    const { record: link, user } = await requireOwnership('savedLink', id)

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
    const { record: link, user } = await requireOwnership('savedLink', id)
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
    const { record: link, user } = await requireOwnership('savedLink', id)
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
    const { record: link, user } = await requireOwnership('savedLink', id)
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
    const { record: link, user } = await requireOwnership('savedLink', id)
    const updated = await db.savedLink.update({
      where: { id },
      data: {
        openCount: link.openCount + 1,
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
    await requireOwnership('linkTag', id)
    await db.linkTag.delete({ where: { id } })
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
    await db.savedLink.update({ where: { id }, data: { deletedAt: new Date() } })
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
