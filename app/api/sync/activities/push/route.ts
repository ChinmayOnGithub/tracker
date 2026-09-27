/**
 * Activity Sync Push Endpoint
 * Receives and processes local changes from clients
 * Hardened:
 * 1. User-scoped idempotency keys (${userId}:${operation.id})
 * 2. Database-backed durable idempotency via db.auditLog
 * 3. Genuine database persistence for ActivityTemplate operations
 * 4. Database safety safeguards (soft delete on ActivityTemplate)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'
import { SyncOperation, SyncResult } from '@/lib/sync/types'
import { ActivityLogSync, ActivityTemplateSync } from '@/lib/sync/adapters/ActivitySyncAdapter'
import { db } from '@/lib/db'
import { ActivityType, Priority, RecurrenceType, Prisma } from '@prisma/client'

// Fast memory cache for in-instance repeated hits
const memoryIdempotencyCache = new Map<string, { timestamp: number; result: SyncResult }>()
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Cleanup memory cache periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of memoryIdempotencyCache.entries()) {
    if (now - value.timestamp > IDEMPOTENCY_TTL) {
      memoryIdempotencyCache.delete(key)
    }
  }
}, 60 * 60 * 1000)

function parseActivityType(type?: string): ActivityType {
  if (type && Object.values(ActivityType).includes(type as ActivityType)) {
    return type as ActivityType
  }
  return ActivityType.PERSONAL
}

function parsePriority(priority?: string): Priority {
  if (priority && Object.values(Priority).includes(priority as Priority)) {
    return priority as Priority
  }
  return Priority.NORMAL
}

function parseRecurrenceType(recurrence?: string): RecurrenceType {
  if (recurrence && Object.values(RecurrenceType).includes(recurrence as RecurrenceType)) {
    return recurrence as RecurrenceType
  }
  return RecurrenceType.daily
}

function parseJsonMetadata(metadata: unknown): Prisma.InputJsonValue | undefined {
  if (metadata === null || metadata === undefined) return undefined
  return metadata as Prisma.InputJsonValue
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { operations } = await request.json()

    if (!Array.isArray(operations)) {
      return NextResponse.json(
        { error: 'Operations must be an array' },
        { status: 400 }
      )
    }

    console.log(`[SyncAPI] Processing ${operations.length} operations for user ${user.id}`)

    const results: SyncResult[] = []

    // Process each operation with durable user-scoped idempotency
    for (const operation of operations) {
      try {
        const rawIdempotencyKey = operation.clientRequestId || operation.id
        const scopedKey = `${user.id}:${rawIdempotencyKey}`

        // 1. Check in-memory instance cache
        const memCached = memoryIdempotencyCache.get(scopedKey)
        if (memCached) {
          console.log(`[SyncAPI] Returning memory-cached result for ${scopedKey}`)
          results.push(memCached.result)
          continue
        }

        // 2. Check durable database-backed idempotency
        const dbCached = await db.auditLog.findFirst({
          where: {
            userId: user.id,
            entityType: 'sync_idempotency',
            entityId: rawIdempotencyKey,
          },
          select: { newData: true }
        })

        if (dbCached && dbCached.newData) {
          console.log(`[SyncAPI] Returning database-cached result for ${scopedKey}`)
          const cachedResult = dbCached.newData as unknown as SyncResult
          memoryIdempotencyCache.set(scopedKey, {
            timestamp: Date.now(),
            result: cachedResult
          })
          results.push(cachedResult)
          continue
        }

        // 3. Execute operation
        const result = await processOperation(operation, user.id)

        // 4. Persist durable idempotency log in database
        await db.auditLog.create({
          data: {
            userId: user.id,
            entityType: 'sync_idempotency',
            entityId: rawIdempotencyKey,
            action: 'SYNC_PUSH',
            performedBy: user.username || user.id,
            newData: result as unknown as Prisma.InputJsonValue,
          }
        }).catch(err => console.warn('[SyncAPI] Failed to record durable idempotency:', err))

        // 5. Update memory cache
        memoryIdempotencyCache.set(scopedKey, {
          timestamp: Date.now(),
          result
        })

        results.push(result)
      } catch (error) {
        console.error('[SyncAPI] Operation failed:', error)
        results.push({
          operation,
          success: false,
          error: {
            category: 'internal',
            code: 'OPERATION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true
          },
          timing: {
            queuedAt: operation.createdAt,
            startedAt: Date.now(),
            completedAt: Date.now(),
            duration: 0
          }
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[SyncAPI] Push failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function processOperation(operation: SyncOperation, userId: string): Promise<SyncResult> {
  const { entityType } = operation

  try {
    if (entityType === 'activityLog') {
      return await processActivityLogOperation(operation as SyncOperation<ActivityLogSync>, userId)
    } else if (entityType === 'activityTemplate') {
      return await processActivityTemplateOperation(operation as SyncOperation<ActivityTemplateSync>, userId)
    } else {
      throw new Error(`Unsupported entity type: ${entityType}`)
    }
  } catch (error) {
    return {
      operation,
      success: false,
      error: {
        category: 'internal',
        code: 'PROCESSING_FAILED',
        message: error instanceof Error ? error.message : 'Processing failed',
        retryable: true
      },
      timing: {
        queuedAt: operation.createdAt,
        startedAt: Date.now(),
        completedAt: Date.now(),
        duration: 0
      }
    }
  }
}

async function processActivityLogOperation(
  operation: SyncOperation<ActivityLogSync>,
  userId: string
): Promise<SyncResult<ActivityLogSync>> {
  const { type, entityId, data } = operation

  try {
    switch (type) {
      case 'create': {
        const isTemporaryId = entityId.startsWith('temp_')
        
        let actualId = entityId
        if (isTemporaryId) {
          const log = await ActivityService.logActivity({
            userId,
            templateId: data.activityId,
            date: data.date,
            status: data.status,
            note: data.note,
            amount: data.amount,
            payload: data.payload
          })
          actualId = log.id
        }

        const existing = await db.activityLog.findUnique({
          where: { id: actualId }
        })

        if (existing && !isTemporaryId) {
          const updated = await ActivityService.updateLog(userId, actualId, {
            status: data.status,
            note: data.note,
            amount: data.amount,
            payload: data.payload
          })

          return {
            operation,
            success: true,
            conflictResolution: 'merge',
            resolvedData: {
              ...data,
              id: updated.id,
              lastModified: Date.now(),
              version: data.version + 1
            },
            timing: {
              queuedAt: operation.createdAt,
              startedAt: Date.now(),
              completedAt: Date.now(),
              duration: 0
            }
          }
        }

        return {
          operation,
          success: true,
          resolvedData: {
            ...data,
            id: actualId,
            lastModified: Date.now()
          },
          timing: {
            queuedAt: operation.createdAt,
            startedAt: Date.now(),
            completedAt: Date.now(),
            duration: 0
          }
        }
      }

      case 'update': {
        await ActivityService.updateLog(userId, entityId, {
          status: data.status,
          note: data.note,
          amount: data.amount,
          payload: data.payload
        })

        return {
          operation,
          success: true,
          resolvedData: {
            ...data,
            lastModified: Date.now(),
            version: data.version + 1
          },
          timing: {
            queuedAt: operation.createdAt,
            startedAt: Date.now(),
            completedAt: Date.now(),
            duration: 0
          }
        }
      }

      case 'delete': {
        await ActivityService.deleteLog(userId, entityId)

        return {
          operation,
          success: true,
          timing: {
            queuedAt: operation.createdAt,
            startedAt: Date.now(),
            completedAt: Date.now(),
            duration: 0
          }
        }
      }

      default:
        throw new Error(`Unsupported operation type: ${type}`)
    }
  } catch (error) {
    return {
      operation,
      success: false,
      error: {
        category: 'internal',
        code: 'PROCESSING_FAILED',
        message: error instanceof Error ? error.message : 'Operation failed',
        retryable: true
      },
      timing: {
        queuedAt: operation.createdAt,
        startedAt: Date.now(),
        completedAt: Date.now(),
        duration: 0
      }
    }
  }
}

async function processActivityTemplateOperation(
  operation: SyncOperation<ActivityTemplateSync>,
  userId: string
): Promise<SyncResult<ActivityTemplateSync>> {
  const { type, entityId, data } = operation

  try {
    switch (type) {
      case 'create': {
        const isTemporaryId = entityId.startsWith('temp_')
        const targetId = isTemporaryId ? undefined : entityId

        const template = await db.activityTemplate.upsert({
          where: { id: targetId || entityId },
          create: {
            id: targetId,
            userId,
            name: data.name,
            category: data.category,
            type: parseActivityType(data.type),
            priority: parsePriority(data.priority),
            estimatedDuration: data.estimatedDuration || 0,
            energyRequired: data.energyRequired || 'MEDIUM',
            icon: data.icon || 'default',
            color: data.color || '#3b82f6',
            isActive: data.isActive !== undefined ? data.isActive : true,
            notes: data.notes || null,
            amount: data.amount || null,
            recurrenceType: parseRecurrenceType(data.recurrenceType),
            recurrenceInterval: data.recurrenceInterval || null,
            recurrenceDaysOfWeek: data.recurrenceDaysOfWeek || null,
            recurrenceDayOfMonth: data.recurrenceDayOfMonth || null,
            recurrenceMonth: data.recurrenceMonth || null,
            metadata: parseJsonMetadata(data.metadata)
          },
          update: {
            name: data.name,
            category: data.category,
            type: parseActivityType(data.type),
            priority: parsePriority(data.priority),
            estimatedDuration: data.estimatedDuration || 0,
            energyRequired: data.energyRequired || 'MEDIUM',
            icon: data.icon || 'default',
            color: data.color || '#3b82f6',
            isActive: data.isActive !== undefined ? data.isActive : true,
            notes: data.notes || null,
            amount: data.amount || null,
            recurrenceType: parseRecurrenceType(data.recurrenceType),
            recurrenceInterval: data.recurrenceInterval || null,
            recurrenceDaysOfWeek: data.recurrenceDaysOfWeek || null,
            recurrenceDayOfMonth: data.recurrenceDayOfMonth || null,
            recurrenceMonth: data.recurrenceMonth || null,
            metadata: parseJsonMetadata(data.metadata),
            deletedAt: null
          }
        })

        return {
          operation,
          success: true,
          resolvedData: {
            ...data,
            id: template.id,
            lastModified: template.updatedAt.getTime()
          },
          timing: {
            queuedAt: operation.createdAt,
            startedAt: Date.now(),
            completedAt: Date.now(),
            duration: 0
          }
        }
      }

      case 'update': {
        await db.activityTemplate.updateMany({
          where: { id: entityId, userId },
          data: {
            name: data.name,
            category: data.category,
            type: data.type ? parseActivityType(data.type) : undefined,
            priority: data.priority ? parsePriority(data.priority) : undefined,
            estimatedDuration: data.estimatedDuration,
            energyRequired: data.energyRequired,
            icon: data.icon,
            color: data.color,
            isActive: data.isActive,
            notes: data.notes,
            amount: data.amount,
            recurrenceType: data.recurrenceType ? parseRecurrenceType(data.recurrenceType) : undefined,
            recurrenceInterval: data.recurrenceInterval,
            recurrenceDaysOfWeek: data.recurrenceDaysOfWeek,
            recurrenceDayOfMonth: data.recurrenceDayOfMonth,
            recurrenceMonth: data.recurrenceMonth,
            metadata: parseJsonMetadata(data.metadata)
          }
        })

        return {
          operation,
          success: true,
          resolvedData: {
            ...data,
            lastModified: Date.now(),
            version: data.version + 1
          },
          timing: {
            queuedAt: operation.createdAt,
            startedAt: Date.now(),
            completedAt: Date.now(),
            duration: 0
          }
        }
      }

      case 'delete': {
        // Soft delete activity template (safeguard: never hard delete)
        await db.activityTemplate.updateMany({
          where: { id: entityId, userId },
          data: { deletedAt: new Date() }
        })

        return {
          operation,
          success: true,
          timing: {
            queuedAt: operation.createdAt,
            startedAt: Date.now(),
            completedAt: Date.now(),
            duration: 0
          }
        }
      }

      default:
        throw new Error(`Unsupported operation type: ${type}`)
    }
  } catch (error) {
    return {
      operation,
      success: false,
      error: {
        category: 'internal',
        code: 'PROCESSING_FAILED',
        message: error instanceof Error ? error.message : 'Operation failed',
        retryable: true
      },
      timing: {
        queuedAt: operation.createdAt,
        startedAt: Date.now(),
        completedAt: Date.now(),
        duration: 0
      }
    }
  }
}