/**
 * Activity Sync Push Endpoint
 * Receives and processes local changes from clients
 * Fixed: Added idempotency key support to prevent duplicate processing
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guards'
import { ActivityService } from '@/lib/services/ActivityService'
import { SyncOperation, SyncResult } from '@/lib/sync/types'
import { ActivityLogSync, ActivityTemplateSync } from '@/lib/sync/adapters/ActivitySyncAdapter'
import { db } from '@/lib/db'

// In-memory cache for idempotency (in production, use Redis or database)
const processedOperations = new Map<string, { timestamp: number; result: SyncResult }>()
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of processedOperations.entries()) {
    if (now - value.timestamp > IDEMPOTENCY_TTL) {
      processedOperations.delete(key)
    }
  }
}, 60 * 60 * 1000) // Every hour

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

    // Process each operation with idempotency
    for (const operation of operations) {
      try {
        // Check idempotency key
        const idempotencyKey = operation.clientRequestId || operation.id
        const cached = processedOperations.get(idempotencyKey)
        
        if (cached) {
          console.log(`[SyncAPI] Returning cached result for ${idempotencyKey}`)
          results.push(cached.result)
          continue
        }
        
        const result = await processOperation(operation, user.id)
        
        // Cache the result
        processedOperations.set(idempotencyKey, {
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
        // Check if this is a temporary ID that needs to be resolved
        const isTemporaryId = entityId.startsWith('temp_')
        
        let actualId = entityId
        if (isTemporaryId) {
          // Create new log and get actual ID
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

        // Check for conflicts with existing logs
        const existing = await db.activityLog.findUnique({
          where: { id: actualId }
        })

        if (existing && !isTemporaryId) {
          // Handle conflict - in this case, we'll update the existing log
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
  _userId: string
): Promise<SyncResult<ActivityTemplateSync>> {
  const { type, entityId, data } = operation

  try {
    switch (type) {
      case 'create': {
        // Activity templates are usually created through the UI
        // This would integrate with ActivityTemplate creation logic
        console.log(`[SyncAPI] Creating activity template: ${data.name}`)
        
        return {
          operation,
          success: true,
          resolvedData: {
            ...data,
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
        // Update activity template
        console.log(`[SyncAPI] Updating activity template: ${entityId}`)
        
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
        // Soft delete activity template
        console.log(`[SyncAPI] Deleting activity template: ${entityId}`)
        
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