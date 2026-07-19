import { db } from '@/lib/db'
import { LinkLibraryPanel } from '@/components/LinkLibraryPanel'
import { getLoggedUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const loggedUser = await getLoggedUser()
  if (!loggedUser) {
    redirect('/')
  }

  const linkCollectionsRaw = await db.linkCollection.findMany({
    where: { userId: loggedUser.id, deletedAt: null },
    include: {
      links: { 
        where: { deletedAt: null }, 
        include: { tags: true },
        orderBy: { sortOrder: 'asc' } 
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  const linkCollections = (linkCollectionsRaw || []).map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
    sortOrder: c.sortOrder,
    links: (c.links || []).map(l => ({
      id: l.id,
      collectionId: l.collectionId,
      url: l.url,
      title: l.title,
      description: l.description,
      favicon: l.favicon,
      thumbnail: l.thumbnail,
      accentColor: l.accentColor,
      notes: l.notes,
      isPinned: l.isPinned,
      isPrivate: l.isPrivate,
      isArchived: l.isArchived,
      openCount: l.openCount,
      lastOpenedAt: l.lastOpenedAt ? l.lastOpenedAt.toISOString() : null,
      tags: (l.tags || []).map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
      })),
      sortOrder: l.sortOrder,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
  }))

  return <LinkLibraryPanel initialCollections={linkCollections} />
}
