"use server"

import { db } from '@/lib/db'
export async function getInitialLinkCollections(userId: string) {
  const collections = await db.linkCollection.findMany({
    where: { userId, deletedAt: null },
    include: {
      links: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { sortOrder: 'asc' },
  })

  return collections.map(c => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt?.toISOString() ?? null,
    links: c.links.map(l => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      deletedAt: l.deletedAt?.toISOString() ?? null,
    })),
  }))
}
