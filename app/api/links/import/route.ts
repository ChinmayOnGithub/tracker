import { NextRequest, NextResponse } from 'next/server'
import { getLoggedUser } from '@/app/actions/auth'
import { db } from '@/lib/db'
import { rateLimiter } from '@/lib/services/RateLimiter'

const MAX_IMPORT_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_IMPORT_RECORDS = 5000

export async function POST(req: NextRequest) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Rate Limiting
    const rateCheck = await rateLimiter.check(`import:links:${user.id}`, 10, 60)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: `Import rate limit exceeded. Retry in ${rateCheck.retryAfterSeconds}s` } },
        { status: 429 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json(
        { error: { code: 'MISSING_FILE', message: 'No file provided' } },
        { status: 400 }
      )
    }

    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `File size exceeds maximum allowed size of ${MAX_IMPORT_BYTES / (1024 * 1024)}MB.`
          }
        },
        { status: 413 }
      )
    }

    const htmlText = await file.text()

    // Stateful parser for Netscape Bookmarks format
    const lines = htmlText.split('\n')
    const folderStack: string[] = ['Imported Bookmarks']
    const linksToImport: { collectionName: string; url: string; title: string; notes?: string; tags?: string[] }[] = []

    for (let line of lines) {
      line = line.trim()

      // Match Folder Tag
      const folderMatch = line.match(/<H3[^>]*>([\s\S]*?)<\/H3>/i)
      if (folderMatch) {
        const folderName = folderMatch[1].replace(/<[^>]*>/g, '').trim().slice(0, 100)
        folderStack.push(folderName || 'Imported Bookmarks')
        continue
      }

      // Match Folder List Close Tag
      if (line.toUpperCase() === '</DL>' || line.toUpperCase() === '</DL><P>') {
        if (folderStack.length > 1) {
          folderStack.pop()
        }
        continue
      }

      // Match Anchor link tag
      const linkMatch = line.match(/<A[^>]*HREF=["']([^"']+)["'][^>]*>([\s\S]*?)<\/A>/i)
      if (linkMatch) {
        const urlCandidate = linkMatch[1].trim()

        // Validate URL protocol (only http and https)
        let finalUrl = urlCandidate
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
          finalUrl = 'https://' + finalUrl
        }

        try {
          const parsed = new URL(finalUrl)
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            continue // Skip non-web schemes (e.g. javascript:, file:, data:)
          }
        } catch {
          continue // Skip invalid URLs
        }

        const rawTitle = linkMatch[2].replace(/<[^>]*>/g, '').trim() || finalUrl
        const title = rawTitle.slice(0, 500)

        const notesMatch = line.match(/NOTES=["']([\s\S]*?)["']/i)
        const tagsMatch = line.match(/TAGS=["']([\s\S]*?)["']/i)

        const notes = notesMatch ? notesMatch[1].slice(0, 5000) : undefined
        const tags = tagsMatch && tagsMatch[1]
          ? tagsMatch[1].split(',').map(t => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20)
          : undefined

        const currentFolder = folderStack[folderStack.length - 1]
        linksToImport.push({
          collectionName: currentFolder,
          url: finalUrl,
          title,
          notes,
          tags
        })

        if (linksToImport.length > MAX_IMPORT_RECORDS) {
          return NextResponse.json(
            {
              error: {
                code: 'TOO_MANY_RECORDS',
                message: `File contains more than the maximum allowed ${MAX_IMPORT_RECORDS} bookmarks.`
              }
            },
            { status: 413 }
          )
        }
      }
    }

    if (linksToImport.length === 0) {
      return NextResponse.json(
        { error: { code: 'EMPTY_IMPORT', message: 'No valid Netscape bookmarks found in file.' } },
        { status: 400 }
      )
    }

    // Deduplicate incoming links by URL per collection
    const seenUrlsInCol = new Set<string>()
    const deduplicatedLinks = linksToImport.filter(item => {
      const key = `${item.collectionName.toLowerCase()}::${item.url}`
      if (seenUrlsInCol.has(key)) return false
      seenUrlsInCol.add(key)
      return true
    })

    let collectionsCreatedCount = 0
    let linksImportedCount = 0

    await db.$transaction(async (tx) => {
      // 1. Fetch user's existing collections
      const existingCollections = await tx.linkCollection.findMany({
        where: { userId: user.id, deletedAt: null }
      })
      const collectionMap = new Map<string, string>() // Name -> ID
      existingCollections.forEach(c => collectionMap.set(c.name.toLowerCase(), c.id))

      // 2. Fetch existing URLs to avoid duplicates
      const existingLinks = await tx.savedLink.findMany({
        where: {
          collection: { userId: user.id },
          deletedAt: null
        },
        select: { collectionId: true, url: true }
      })
      const existingLinkSet = new Set(existingLinks.map(l => `${l.collectionId}::${l.url}`))

      for (const item of deduplicatedLinks) {
        const colKey = item.collectionName.toLowerCase()
        let collectionId = collectionMap.get(colKey)

        if (!collectionId) {
          const colCount = await tx.linkCollection.count({ where: { userId: user.id, deletedAt: null } })
          const newCol = await tx.linkCollection.create({
            data: {
              userId: user.id,
              name: item.collectionName,
              color: '#6366f1',
              sortOrder: colCount
            }
          })
          collectionId = newCol.id
          collectionMap.set(colKey, collectionId)
          collectionsCreatedCount++
        }

        const linkKey = `${collectionId}::${item.url}`
        if (!existingLinkSet.has(linkKey)) {
          const linkCount = await tx.savedLink.count({ where: { collectionId, deletedAt: null } })

          await tx.savedLink.create({
            data: {
              collectionId,
              url: item.url,
              title: item.title,
              description: null,
              notes: item.notes || null,
              sortOrder: linkCount,
              tags: item.tags && item.tags.length > 0 ? {
                connectOrCreate: item.tags.map(tagName => ({
                  where: {
                    userId_name: {
                      userId: user.id,
                      name: tagName
                    }
                  },
                  create: {
                    userId: user.id,
                    name: tagName
                  }
                }))
              } : undefined
            }
          })
          existingLinkSet.add(linkKey)
          linksImportedCount++
        }
      }
    })

    return NextResponse.json({
      success: true,
      collectionsCreated: collectionsCreatedCount,
      linksImported: linksImportedCount,
      totalProcessed: linksToImport.length
    })
  } catch (error) {
    console.error('[LinkImport] Import failed:', error)
    return NextResponse.json(
      { error: { code: 'IMPORT_FAILED', message: 'Failed to process bookmark import.' } },
      { status: 500 }
    )
  }
}
