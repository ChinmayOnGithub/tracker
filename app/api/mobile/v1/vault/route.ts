import { apiSuccess, apiError } from '@/lib/api-response'
import { AuthService } from '@/lib/services/AuthService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { db } from '@/lib/db'
import { decryptTitle, encryptTitle } from '@/lib/vault-crypto'

export async function GET(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    try {
      await AuthorizationService.assertUserModuleAccess(user, 'documents')
    } catch {
      return apiError('FORBIDDEN', 'Access denied to Vault module', 403)
    }

    const { searchParams } = new URL(request.url)
    const parentId = searchParams.get('parentId') || null

    const documents = await db.secureDocument.findMany({
      where: {
        userId: user.id,
        parentId: parentId,
        deletedAt: null,
      },
      orderBy: [{ isFolder: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    })

    const items = documents.map((doc) => {
      let name = doc.searchName || 'Unknown'
      try {
        name = decryptTitle(doc.encryptedTitle)
      } catch {
        name = doc.searchName || 'Encrypted Item'
      }

      return {
        id: doc.id,
        name,
        searchName: doc.searchName,
        mimeGroup: doc.mimeGroup,
        extension: doc.extension,
        fileSize: doc.fileSize,
        isFolder: doc.isFolder,
        isFavorite: doc.isFavorite,
        parentId: doc.parentId,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }
    })

    // Compute simple breadcrumbs if in a subfolder
    const breadcrumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Vault' }]
    if (parentId) {
      let currentParentId: string | null = parentId
      const trail: { id: string | null; name: string }[] = []
      let depth = 0

      while (currentParentId && depth < 5) {
        const parentDoc: { id: string; encryptedTitle: string; searchName: string; parentId: string | null } | null = await db.secureDocument.findFirst({
          where: { id: currentParentId, userId: user.id, deletedAt: null },
          select: { id: true, encryptedTitle: true, searchName: true, parentId: true },
        })
        if (!parentDoc) break

        let parentName = parentDoc.searchName || 'Folder'
        try {
          parentName = decryptTitle(parentDoc.encryptedTitle)
        } catch {
          parentName = parentDoc.searchName || 'Folder'
        }

        trail.unshift({ id: parentDoc.id, name: parentName })
        currentParentId = parentDoc.parentId
        depth++
      }
      breadcrumbs.push(...trail)
    }

    return apiSuccess({ items, breadcrumbs })
  } catch (error) {
    console.error('[MobileVaultGet] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to retrieve vault items', 500)
  }
}

export async function POST(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    try {
      await AuthorizationService.assertUserModuleAccess(user, 'documents')
    } catch {
      return apiError('FORBIDDEN', 'Access denied to Vault module', 403)
    }

    let body: { name?: string; parentId?: string | null; isFolder?: boolean }
    try {
      body = await request.json()
    } catch {
      return apiError('VALIDATION_ERROR', 'Invalid JSON payload', 400)
    }

    const name = body.name?.trim()
    if (!name) {
      return apiError('VALIDATION_ERROR', 'Name is required', 400)
    }

    const parentId = body.parentId || null
    if (parentId) {
      const parent = await db.secureDocument.findFirst({
        where: { id: parentId, userId: user.id, isFolder: true, deletedAt: null },
      })
      if (!parent) {
        return apiError('NOT_FOUND', 'Target folder not found or unauthorized', 404)
      }
    }

    const encryptedTitle = encryptTitle(name)

    const folder = await db.secureDocument.create({
      data: {
        userId: user.id,
        encryptedTitle,
        searchName: name,
        mimeGroup: 'folder',
        isFolder: true,
        parentId,
      },
    })

    return apiSuccess(
      {
        item: {
          id: folder.id,
          name,
          searchName: folder.searchName,
          mimeGroup: 'folder',
          extension: null,
          fileSize: null,
          isFolder: true,
          isFavorite: false,
          parentId: folder.parentId,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString(),
        },
      },
      201
    )
  } catch (error) {
    console.error('[MobileVaultPost] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to create vault folder', 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await AuthService.resolveAuthFromRequest(request)
    if (!user) {
      return apiError('UNAUTHENTICATED', 'Missing or invalid session token', 401)
    }

    try {
      await AuthorizationService.assertUserModuleAccess(user, 'documents')
    } catch {
      return apiError('FORBIDDEN', 'Access denied to Vault module', 403)
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return apiError('VALIDATION_ERROR', 'Missing document ID', 400)
    }

    const doc = await db.secureDocument.findFirst({
      where: { id, userId: user.id, deletedAt: null },
    })

    if (!doc) {
      return apiError('NOT_FOUND', 'Vault item not found', 404)
    }

    const now = new Date()
    await db.$transaction(async (tx) => {
      await tx.secureDocument.update({
        where: { id },
        data: { deletedAt: now },
      })
      if (doc.isFolder) {
        await tx.secureDocument.updateMany({
          where: { parentId: id, userId: user.id, deletedAt: null },
          data: { deletedAt: now },
        })
      }
    })

    return apiSuccess({ deleted: true, id })
  } catch (error) {
    console.error('[MobileVaultDelete] Internal error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to delete vault item', 500)
  }
}
