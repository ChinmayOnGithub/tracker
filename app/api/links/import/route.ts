import { NextRequest, NextResponse } from 'next/server'
import { getLoggedUser } from '@/app/actions/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
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
        const folderName = folderMatch[1].replace(/<[^>]*>/g, '').trim()
        folderStack.push(folderName)
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
        const url = linkMatch[1].trim()
        const title = linkMatch[2].replace(/<[^>]*>/g, '').trim() || url
        
        const notesMatch = line.match(/NOTES=["']([\s\S]*?)["']/i)
        const tagsMatch = line.match(/TAGS=["']([\s\S]*?)["']/i)
        
        const notes = notesMatch ? notesMatch[1] : undefined
        const tags = tagsMatch && tagsMatch[1] ? tagsMatch[1].split(',') : undefined

        const currentFolder = folderStack[folderStack.length - 1]
        linksToImport.push({
          collectionName: currentFolder,
          url,
          title,
          notes,
          tags
        })
      }
    }

    if (linksToImport.length === 0) {
      return NextResponse.json({ error: 'No valid Netscape bookmarks found in file.' }, { status: 400 })
    }

    // Import collections and links in groups
    let collectionsCreatedCount = 0
    let linksImportedCount = 0

    // Cache user's collections to avoid duplicate queries
    const existingCollections = await db.linkCollection.findMany({
      where: { userId: user.id, deletedAt: null }
    })
    const collectionMap = new Map<string, string>() // Name -> ID
    existingCollections.forEach(c => collectionMap.set(c.name.toLowerCase(), c.id))

    for (const item of linksToImport) {
      const colKey = item.collectionName.toLowerCase()
      let collectionId = collectionMap.get(colKey)

      if (!collectionId) {
        // Create new collection
        const colCount = await db.linkCollection.count({ where: { userId: user.id, deletedAt: null } })
        const newCol = await db.linkCollection.create({
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

      // Automatically construct full URL
      let finalUrl = item.url
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl
      }

      // Check duplicates in this collection
      const duplicate = await db.savedLink.findFirst({
        where: {
          collectionId,
          url: finalUrl,
          deletedAt: null
        }
      })

      if (!duplicate) {
        const linkCount = await db.savedLink.count({ where: { collectionId, deletedAt: null } })
        
        // Import Link
        await db.savedLink.create({
          data: {
            collectionId,
            url: finalUrl,
            title: item.title,
            description: null,
            notes: item.notes || null,
            sortOrder: linkCount,
            tags: item.tags && item.tags.length > 0 ? {
              connectOrCreate: item.tags.map(tagName => ({
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
          }
        })
        linksImportedCount++
      }
    }

    return NextResponse.json({
      success: true,
      collectionsCreated: collectionsCreatedCount,
      linksImported: linksImportedCount,
      totalProcessed: linksToImport.length
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
