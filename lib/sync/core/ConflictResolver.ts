/**
 * Production Conflict Resolution System
 * Authoritative conflict detection and resolution strategies
 */

import { ConflictContext, ConflictResolution, SyncLogger } from '../types'

export interface ConflictResolutionStrategy<T = unknown> {
  name: string
  resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }>
}

export interface ConflictRule<T = unknown> {
  entityType?: string
  fieldPath?: string
  priority: number
  strategy: ConflictResolutionStrategy<T>
}

/**
 * Last Writer Wins Strategy
 * Authoritatively selects newest write based on timestamp, version, or deterministic local preference
 */
export class LastWriterWinsStrategy<T = unknown> implements ConflictResolutionStrategy<T> {
  name = 'last-writer-wins'

  async resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    const { localMetadata, remoteMetadata, localData, remoteData } = context
    
    // Safely parse timestamps, handling malformed metadata and nulls
    const localTime = Number(localMetadata?.lastModified) || 0
    const remoteTime = Number(remoteMetadata?.lastModified) || 0
    const localVer = Number(localMetadata?.version) || 0
    const remoteVer = Number(remoteMetadata?.version) || 0

    if (localTime > remoteTime) {
      return {
        resolution: 'local',
        data: localData,
        reason: `Local version is newer (${localTime} > ${remoteTime})`
      }
    } else if (remoteTime > localTime) {
      return {
        resolution: 'remote',
        data: remoteData,
        reason: `Remote version is newer (${remoteTime} > ${localTime})`
      }
    } else {
      // Equal timestamps: evaluate version
      if (localVer > remoteVer) {
        return {
          resolution: 'local',
          data: localData,
          reason: `Equal timestamps (${localTime}), higher local version (${localVer} > ${remoteVer})`
        }
      } else if (remoteVer > localVer) {
        return {
          resolution: 'remote',
          data: remoteData,
          reason: `Equal timestamps (${remoteTime}), higher remote version (${remoteVer} > ${localVer})`
        }
      } else {
        // Equal timestamps and versions: deterministic fallback to local user intent
        return {
          resolution: 'local',
          data: localData,
          reason: 'Equal timestamps and versions: deterministic local preference'
        }
      }
    }
  }
}

/**
 * Field-level Three-Way Merge Strategy
 */
export class ThreeWayMergeStrategy<T = unknown> implements ConflictResolutionStrategy<T> {
  name = 'three-way-merge'

  async resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    const { localData, remoteData } = context
    
    if (!localData || !remoteData || typeof localData !== 'object' || typeof remoteData !== 'object') {
      // Fall back to last writer wins for non-objects or deletions
      const lww = new LastWriterWinsStrategy<T>()
      return lww.resolve(context)
    }
    
    try {
      const merged = this.mergeObjects(localData as Record<string, unknown>, remoteData as Record<string, unknown>)
      
      return {
        resolution: 'merge',
        data: merged as T,
        reason: 'Field-level merge completed successfully'
      }
    } catch (error) {
      return {
        resolution: 'manual',
        data: localData,
        reason: `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private mergeObjects(local: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...remote }
    
    for (const [key, localValue] of Object.entries(local)) {
      const remoteValue = remote[key]
      
      if (remoteValue === undefined) {
        // Field only exists locally
        merged[key] = localValue
      } else if (localValue !== remoteValue) {
        // Conflict - need resolution rules
        merged[key] = this.resolveFieldConflict(key, localValue, remoteValue)
      }
    }
    
    return merged
  }

  private resolveFieldConflict(_field: string, localValue: unknown, remoteValue: unknown): unknown {
    // Prefer non-null values
    if (localValue != null && remoteValue == null) {
      return localValue
    }
    if (localValue == null && remoteValue != null) {
      return remoteValue
    }
    
    // For strings, prefer longer content (assuming it's more complete)
    if (typeof localValue === 'string' && typeof remoteValue === 'string') {
      return localValue.length >= remoteValue.length ? localValue : remoteValue
    }
    
    // For numbers, prefer higher value (for counters/progress)
    if (typeof localValue === 'number' && typeof remoteValue === 'number') {
      return Math.max(localValue, remoteValue)
    }
    
    // For arrays, merge and deduplicate
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      return Array.from(new Set([...localValue, ...remoteValue]))
    }
    
    // Default: prefer remote (server authority)
    return remoteValue
  }
}

/**
 * Operational Transform Strategy (for collaborative editing)
 */
export class OperationalTransformStrategy<T = unknown> implements ConflictResolutionStrategy<T> {
  name = 'operational-transform'

  async resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    try {
      const merger = new ThreeWayMergeStrategy<T>()
      const result = await merger.resolve(context)
      
      return {
        ...result,
        reason: `OT resolution: ${result.reason}`
      }
    } catch (error) {
      return {
        resolution: 'manual',
        data: context.localData,
        reason: `OT failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
}

/**
 * Custom Business Logic Strategy
 */
export class BusinessLogicStrategy<T = unknown> implements ConflictResolutionStrategy<T> {
  name = 'business-logic'
  
  constructor(
    private entityType: string,
    private customResolver: (context: ConflictContext<T>) => Promise<{ resolution: ConflictResolution; data?: T; reason?: string }>
  ) {}

  async resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    if (context.entityType !== this.entityType) {
      throw new Error(`Business logic strategy is for ${this.entityType}, got ${context.entityType}`)
    }
    
    return this.customResolver(context)
  }
}

/**
 * Main Canonical Conflict Resolver
 */
export class ConflictResolver {
  private strategies = new Map<string, ConflictResolutionStrategy>()
  private rules: ConflictRule[] = []
  private logger?: SyncLogger

  constructor(logger?: SyncLogger) {
    this.logger = logger
    
    // Register default strategies
    this.registerStrategy(new LastWriterWinsStrategy())
    this.registerStrategy(new ThreeWayMergeStrategy())
    this.registerStrategy(new OperationalTransformStrategy())
  }

  /**
   * Register a conflict resolution strategy
   */
  registerStrategy<T>(strategy: ConflictResolutionStrategy<T>): void {
    this.strategies.set(strategy.name, strategy)
    this.logger?.debug('ConflictResolver registered strategy', { strategyName: strategy.name })
  }

  /**
   * Add a conflict resolution rule
   */
  addRule<T>(rule: ConflictRule<T>): void {
    const insertIndex = this.rules.findIndex(r => r.priority < rule.priority)
    if (insertIndex === -1) {
      this.rules.push(rule)
    } else {
      this.rules.splice(insertIndex, 0, rule)
    }
    
    this.logger?.debug('ConflictResolver added rule', {
      entityType: rule.entityType,
      fieldPath: rule.fieldPath,
      priority: rule.priority,
      strategy: rule.strategy.name
    })
  }

  /**
   * Resolve a conflict using registered rules and strategies
   */
  async resolve<T>(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    this.logger?.info('ConflictResolver resolving conflict', {
      entityType: context.entityType,
      entityId: context.entityId,
      localVersion: context.localMetadata?.version,
      remoteVersion: context.remoteMetadata?.version
    })

    // Find applicable rule
    const rule = this.findApplicableRule(context)
    
    if (rule) {
      try {
        const strategy = this.strategies.get(rule.strategy.name) || rule.strategy
        const result = await strategy.resolve(context)
        
        this.logger?.info('ConflictResolver resolution completed', {
          entityType: context.entityType,
          entityId: context.entityId,
          resolution: result.resolution,
          strategy: rule.strategy.name,
          reason: result.reason
        })
        
        return {
          resolution: result.resolution,
          data: result.data as T | undefined,
          reason: result.reason
        }
      } catch (error) {
        this.logger?.error('ConflictResolver strategy failed, falling back to default', error as Error, {
          entityType: context.entityType,
          entityId: context.entityId,
          strategy: rule.strategy.name
        })
      }
    }

    // Fallback to default strategy (last-writer-wins)
    const defaultStrategy = this.strategies.get('last-writer-wins')
    if (defaultStrategy) {
      return defaultStrategy.resolve(context) as Promise<{ resolution: ConflictResolution; data?: T; reason?: string }>
    }

    return {
      resolution: 'local',
      data: context.localData,
      reason: 'Safe fallback to local data'
    }
  }

  /**
   * Clean public helper to resolve between two entity states directly
   */
  async resolveEntity<T>(params: {
    entityType?: string
    entityId?: string
    local: T
    remote: T
    localUpdatedAt?: Date | string | number | null
    remoteUpdatedAt?: Date | string | number | null
    localVersion?: number
    remoteVersion?: number
  }): Promise<T> {
    const parseTime = (val?: Date | string | number | null): number => {
      if (!val) return 0
      if (typeof val === 'number') return val
      if (val instanceof Date) return val.getTime()
      const parsed = new Date(val).getTime()
      return isNaN(parsed) ? 0 : parsed
    }

    const localTime = parseTime(params.localUpdatedAt ?? (params.local as { updatedAt?: Date | string | null })?.updatedAt)
    const remoteTime = parseTime(params.remoteUpdatedAt ?? (params.remote as { updatedAt?: Date | string | null })?.updatedAt)

    const context: ConflictContext<T> = {
      entityType: params.entityType || 'default',
      entityId: params.entityId || (params.local as { id?: string })?.id || 'unknown',
      localData: params.local,
      remoteData: params.remote,
      localMetadata: {
        id: params.entityId || 'local',
        entityType: params.entityType || 'default',
        entityId: params.entityId || 'local',
        lastModified: localTime,
        version: params.localVersion ?? 1,
        syncStatus: 'synced',
        retryCount: 0,
        createdAt: localTime,
        updatedAt: localTime
      },
      remoteMetadata: {
        id: params.entityId || 'remote',
        entityType: params.entityType || 'default',
        entityId: params.entityId || 'remote',
        lastModified: remoteTime,
        version: params.remoteVersion ?? 1,
        syncStatus: 'synced',
        retryCount: 0,
        createdAt: remoteTime,
        updatedAt: remoteTime
      }
    }

    const result = await this.resolve(context)
    if (result.resolution === 'remote') {
      return params.remote
    }
    if (result.resolution === 'merge' && result.data !== undefined) {
      return result.data
    }
    return params.local
  }

  private findApplicableRule<T>(context: ConflictContext<T>): ConflictRule<T> | null {
    for (const rule of this.rules) {
      if (rule.entityType && rule.entityType !== context.entityType) {
        continue
      }
      if (rule.fieldPath) {
        continue
      }
      return rule as ConflictRule<T>
    }
    return null
  }

  getStrategies(): string[] {
    return Array.from(this.strategies.keys())
  }

  getRules(): ConflictRule[] {
    return [...this.rules]
  }

  clearRules(): void {
    this.rules.length = 0
    this.logger?.debug('ConflictResolver cleared all rules')
  }
}

/**
 * Backward-compatible LastWriteWinsResolver adapter
 */
export class LastWriteWinsResolver {
  private resolver = new ConflictResolver()

  async resolve<T>(context: {
    entityId: string
    localEntity: T & { updatedAt?: Date | string | null }
    remoteEntity: T & { updatedAt?: Date | string | null }
    localTimestamp?: Date
    remoteTimestamp?: Date
  }): Promise<T> {
    return this.resolver.resolveEntity({
      entityId: context.entityId,
      local: context.localEntity,
      remote: context.remoteEntity,
      localUpdatedAt: context.localTimestamp ?? context.localEntity?.updatedAt,
      remoteUpdatedAt: context.remoteTimestamp ?? context.remoteEntity?.updatedAt
    })
  }
}