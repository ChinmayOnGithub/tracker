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
    const user = await requireAuth(request)
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

        // 2. Atomically claim operation via database unique constraint (Issue #135)
        let claimed = false
        try {
          await db.syncOperation.create({
            data: {
              userId: user.id,
              clientRequestId: rawIdempotencyKey,
              operationType: operation.type,
              status: 'IN_PROGRESS',
            }
          })
          claimed = true
        } catch (err: unknown) {
          const isUniqueViolation =
            (err as { code?: string })?.code === 'P2002' ||
            (err instanceof Error && err.message.toLowerCase().includes('unique constraint'))

          if (!isUniqueViolation) {
            throw err
          }
        }

        // If not claimed by this request, another concurrent or previous request already claimed it
        if (!claimed) {
          console.log(`[SyncAPI] Operation already claimed or executed for ${scopedKey}, retrieving existing result`)
          let existing = await db.syncOperation.findUnique({
            where: {
              userId_clientRequestId: {
                userId: user.id,
                clientRequestId: rawIdempotencyKey,
              }
            }
          })

          // Wait up to 5s if currently in progress by concurrent request
          let waited = 0
          while (existing && existing.status === 'IN_PROGRESS' && waited < 5000) {
            await new Promise((r) => setTimeout(r, 100))
            waited += 100
            existing = await db.syncOperation.findUnique({
              where: {
                userId_clientRequestId: {
                  userId: user.id,
                  clientRequestId: rawIdempotencyKey,
                }
              }
            })
          }

          if (existing && existing.status === 'COMPLETED' && existing.responseJson) {
            const cachedResult = existing.responseJson as unknown as SyncResult
            memoryIdempotencyCache.set(scopedKey, {
              timestamp: Date.now(),
              result: cachedResult,
            })
            results.push(cachedResult)
            continue
          }

          if (existing && existing.status === 'FAILED' && existing.responseJson) {
            const cachedResult = existing.responseJson as unknown as SyncResult
            results.push(cachedResult)
            continue
          }

          if (existing?.status === 'IN_PROGRESS') {
            results.push({
              operation,
              success: false,
              error: {
                category: 'conflict',
                code: 'OPERATION_IN_PROGRESS',
                message: 'Concurrent duplicate operation is currently being processed',
                retryable: true,
              },
              timing: {
                queuedAt: operation.createdAt,
                startedAt: Date.now(),
                completedAt: Date.now(),
                duration: 0,
              },
            })
            continue
          }
        }

        // 3. We hold the exclusive claim — execute the mutation
        let result: SyncResult
        try {
          result = await processOperation(operation, user.id)

          // 4. Update the claimed syncOperation row with completed status and result
          await db.syncOperation.update({
            where: {
              userId_clientRequestId: {
                userId: user.id,
                clientRequestId: rawIdempotencyKey,
              }
            },
            data: {
              status: result.success ? 'COMPLETED' : 'FAILED',
              responseJson: result as unknown as Prisma.InputJsonValue,
              completedAt: new Date(),
            }
          }).catch((err) => console.warn('[SyncAPI] Failed to complete durable sync operation:', err))
        } catch (execErr) {
          await db.syncOperation.update({
            where: {
              userId_clientRequestId: {
                userId: user.id,
                clientRequestId: rawIdempotencyKey,
              }
            },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
            }
          }).catch(() => {})
          throw execErr
        }

        // 5. Update user's monotonic sync cursor on successful mutation
        if (result.success) {
          await db.syncCursor.upsert({
            where: { userId: user.id },
            create: { userId: user.id, revision: 1n },
            update: { revision: { increment: 1n } }
          }).catch(err => console.warn('[SyncAPI] Failed to bump sync cursor:', err))
        }

        // 6. Update memory cache
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

        const template = await db.activityTemplate.create({
          data: {
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
            metadata: parseJsonMetadata(data.metadata),
            version: 1
          }
        })

        return {
          operation,
          success: true,
          resolvedData: {
            ...data,
            id: template.id,
            version: 1,
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
        const existing = await db.activityTemplate.findFirst({
          where: { id: entityId, userId, deletedAt: null }
        })

        if (!existing) {
          throw new Error('Activity template not found')
        }

        // Version conflict detection
        if (data.version !== undefined && data.version !== existing.version) {
          return {
            operation,
            success: false,
            error: {
              category: 'conflict',
              code: 'VERSION_CONFLICT',
              message: `Server version is ${existing.version}, incoming is ${data.version}`,
              retryable: false
            },
            resolvedData: {
              ...data,
              id: existing.id,
              version: existing.version,
              lastModified: existing.updatedAt.getTime()
            },
            timing: {
              queuedAt: operation.createdAt,
              startedAt: Date.now(),
              completedAt: Date.now(),
              duration: 0
            }
          }
        }

        const updated = await db.activityTemplate.update({
          where: { id: existing.id },
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
            metadata: parseJsonMetadata(data.metadata),
            version: existing.version + 1,
            updatedAt: new Date()
          }
        })

        return {
          operation,
          success: true,
          resolvedData: {
            ...data,
            lastModified: updated.updatedAt.getTime(),
            version: updated.version
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
        const result = await db.activityTemplate.updateMany({
          where: { id: entityId, userId, deletedAt: null },
          data: { deletedAt: new Date(), version: { increment: 1 } }
        })

        if (result.count !== 1) {
          throw new Error('Activity template not found or already deleted')
        }

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