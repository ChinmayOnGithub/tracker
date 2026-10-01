import { describe, it, expect, mock } from 'bun:test'
import { POST as syncPushPost } from '@/app/api/sync/activities/push/route'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import type { SyncOperation, ActivityTemplate } from '@prisma/client'

describe('Issue #135: Sync Idempotency Race & Atomic Claim Protection', () => {
  const testUserId = 'usr_race_test_123'

  it('atomically claims operation and prevents duplicate execution during concurrent requests', async () => {
    const origRequireAuth = AuthorizationService.requireAuth
    const origCreateOp = db.syncOperation.create
    const origFindUniqueOp = db.syncOperation.findUnique
    const origUpdateOp = db.syncOperation.update
    const origUpsertCursor = db.syncCursor.upsert
    const origCreateTemplate = db.activityTemplate.create

    let templateCreateCount = 0
    const syncStore = new Map<string, { status: string; responseJson: unknown }>()

    try {
      AuthorizationService.requireAuth = mock(() =>
        Promise.resolve({ id: testUserId, username: 'race_user', isOwner: true })
      )

      // Mock syncOperation.create with atomic unique constraint semantics
      db.syncOperation.create = mock((args?: { data: { userId: string; clientRequestId: string; operationType: string; status: string } }) => {
        const key = `${args?.data.userId}:${args?.data.clientRequestId}`
        if (syncStore.has(key)) {
          const err = new Error('Unique constraint failed on the fields: (`userId`,`clientRequestId`)')
          ;(err as unknown as { code: string }).code = 'P2002'
          return Promise.reject(err)
        }
        syncStore.set(key, { status: args?.data.status || 'IN_PROGRESS', responseJson: null })
        return Promise.resolve({
          id: 'op_' + key,
          userId: args!.data.userId,
          clientRequestId: args!.data.clientRequestId,
          operationType: args!.data.operationType,
          status: args!.data.status,
          responseJson: null,
          createdAt: new Date(),
          completedAt: null,
        } as SyncOperation)
      }) as unknown as typeof db.syncOperation.create

      db.syncOperation.findUnique = mock((args?: { where: { userId_clientRequestId: { userId: string; clientRequestId: string } } }) => {
        const key = `${args?.where.userId_clientRequestId.userId}:${args?.where.userId_clientRequestId.clientRequestId}`
        const record = syncStore.get(key)
        if (!record) return Promise.resolve(null)
        return Promise.resolve({
          id: 'op_' + key,
          userId: args!.where.userId_clientRequestId.userId,
          clientRequestId: args!.where.userId_clientRequestId.clientRequestId,
          operationType: 'create',
          status: record.status,
          responseJson: record.responseJson,
          createdAt: new Date(),
          completedAt: record.status === 'COMPLETED' ? new Date() : null,
        } as SyncOperation)
      }) as unknown as typeof db.syncOperation.findUnique

      db.syncOperation.update = mock((args?: { where: { userId_clientRequestId: { userId: string; clientRequestId: string } }; data: { status?: string; responseJson?: unknown; completedAt?: Date } }) => {
        const key = `${args?.where.userId_clientRequestId.userId}:${args?.where.userId_clientRequestId.clientRequestId}`
        const existing = syncStore.get(key) || { status: 'IN_PROGRESS', responseJson: null }
        if (args?.data.status) existing.status = args.data.status
        if (args?.data.responseJson) existing.responseJson = args.data.responseJson
        syncStore.set(key, existing)
        return Promise.resolve({
          id: 'op_' + key,
          userId: args!.where.userId_clientRequestId.userId,
          clientRequestId: args!.where.userId_clientRequestId.clientRequestId,
          operationType: 'create',
          status: existing.status,
          responseJson: existing.responseJson,
          createdAt: new Date(),
          completedAt: new Date(),
        } as SyncOperation)
      }) as unknown as typeof db.syncOperation.update

      db.syncCursor.upsert = mock(() => Promise.resolve({ userId: testUserId, revision: 1n, updatedAt: new Date() })) as unknown as typeof db.syncCursor.upsert

      // Mock template creation: track number of mutations
      db.activityTemplate.create = mock((args?: { data: { name: string } }) => {
        templateCreateCount++
        return Promise.resolve({
          id: 'tmpl_created_123',
          userId: testUserId,
          name: args?.data.name || 'Test',
          category: 'personal',
          type: 'PERSONAL',
          priority: 'NORMAL',
          estimatedDuration: 30,
          energyRequired: 'MEDIUM',
          icon: 'default',
          color: '#3b82f6',
          isActive: true,
          notes: null,
          amount: null,
          recurrenceType: 'daily',
          recurrenceInterval: 1,
          recurrenceDaysOfWeek: null,
          recurrenceDayOfMonth: null,
          recurrenceMonth: null,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        } as unknown as ActivityTemplate)
      }) as unknown as typeof db.activityTemplate.create

      const clientReqId = 'client_req_race_001'

      const makeRequest = () =>
        new NextRequest('http://localhost:3000/api/sync/activities/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operations: [
              {
                id: clientReqId,
                clientRequestId: clientReqId,
                type: 'create',
                entityType: 'activityTemplate',
                entityId: 'tmpl_client_1',
                data: {
                  name: 'Concurrent Activity Test',
                  category: 'health',
                },
                createdAt: Date.now(),
              },
            ],
          }),
        })

      // Execute two concurrent push requests with the exact same clientRequestId
      const [res1, res2] = await Promise.all([
        syncPushPost(makeRequest()),
        syncPushPost(makeRequest()),
      ])

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)

      const json1 = await res1.json()
      const json2 = await res2.json()

      // Exactly ONE underlying database mutation was performed
      expect(templateCreateCount).toBe(1)

      // Both requests returned success with resolved entity data
      expect(json1.results[0].success).toBe(true)
      expect(json2.results[0].success).toBe(true)
      expect(json1.results[0].resolvedData.name).toBe('Concurrent Activity Test')
      expect(json2.results[0].resolvedData.name).toBe('Concurrent Activity Test')

      // Subsequent call with same clientRequestId also returns cached result without re-executing
      const res3 = await syncPushPost(makeRequest())
      expect(res3.status).toBe(200)
      const json3 = await res3.json()
      expect(json3.results[0].success).toBe(true)
      expect(templateCreateCount).toBe(1) // Still 1!
    } finally {
      AuthorizationService.requireAuth = origRequireAuth
      db.syncOperation.create = origCreateOp
      db.syncOperation.findUnique = origFindUniqueOp
      db.syncOperation.update = origUpdateOp
      db.syncCursor.upsert = origUpsertCursor
      db.activityTemplate.create = origCreateTemplate
    }
  })
})
