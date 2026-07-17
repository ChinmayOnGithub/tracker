import { NextRequest, NextResponse } from 'next/server'
import { getLoggedUser } from '@/app/actions/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const user = await getLoggedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const collectionId = searchParams.get('collectionId')
    const format = searchParams.get('format') || 'json'

    // Fetch collections and links
    const collections = await db.linkCollection.findMany({
      where: {
        userId: user.id,
        id: collectionId ? collectionId : undefined,
        deletedAt: null,
      },
      include: {
        links: {
          where: { deletedAt: null },
          include: { tags: true },
          orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }],
        },
      },
      orderBy: { sortOrder: 'asc' },
    })

    if (format === 'json') {
      return NextResponse.json(collections)
    }

    if (format === 'csv') {
      let csvContent = 'Collection,Title,URL,Notes,Tags,Pinned,Private,Archived,Created At\n'
      for (const col of collections) {
        for (const link of col.links) {
          const escapeCsv = (str: string | null | undefined) => {
            if (!str) return '""'
            return `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`
          }
          const tagsStr = link.tags.map(t => t.name).join(', ')
          csvContent += [
            escapeCsv(col.name),
            escapeCsv(link.title),
            escapeCsv(link.url),
            escapeCsv(link.notes),
            escapeCsv(tagsStr),
            link.isPinned ? 'TRUE' : 'FALSE',
            link.isPrivate ? 'TRUE' : 'FALSE',
            link.isArchived ? 'TRUE' : 'FALSE',
            link.createdAt.toISOString(),
          ].join(',') + '\n'
        }
      }
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="tracker-links-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    if (format === 'html') {
      let htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`
      for (const col of collections) {
        htmlContent += `    <DT><H3 ADD_DATE="${Math.floor(col.createdAt.getTime() / 1000)}" LAST_MODIFIED="${Math.floor(col.updatedAt.getTime() / 1000)}" COLOR="${col.color}">${col.name}</H3>\n    <DL><p>\n`
        for (const link of col.links) {
          const tagsStr = link.tags.map(t => t.name).join(',')
          htmlContent += `        <DT><A HREF="${link.url}" ADD_DATE="${Math.floor(link.createdAt.getTime() / 1000)}" PRIVATE="${link.isPrivate}" PINNED="${link.isPinned}" ARCHIVED="${link.isArchived}" TAGS="${tagsStr}" NOTES="${link.notes || ''}">${link.title}</A>\n`
        }
        htmlContent += `    </DL><p>\n`
      }
      htmlContent += `</DL><p>\n`

      return new Response(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="tracker-bookmarks-${new Date().toISOString().slice(0, 10)}.html"`,
        },
      })
    }

    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
