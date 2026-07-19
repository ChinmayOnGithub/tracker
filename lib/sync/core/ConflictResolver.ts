/**
 * Production Conflict Resolution System
 * Sophisticated conflict detection and resolution strategies
 */

import { ConflictContext, ConflictResolution, SyncMetadata, SyncLogger } from '../types'

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
 */
export class LastWriterWinsStrategy<T = unknown> implements ConflictResolutionStrategy<T> {
  name = 'last-writer-wins'

  async resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    const { localMetadata, remoteMetadata } = context
    
    if (localMetadata.lastModified > remoteMetadata.lastModified) {
      return {
        resolution: 'local',
        reason: `Local version is newer (${localMetadata.lastModified} > ${remoteMetadata.lastModified})`
      }
    } else if (remoteMetadata.lastModified > localMetadata.lastModified) {
      return {
        resolution: 'remote',
        reason: `Remote version is newer (${remoteMetadata.lastModified} > ${localMetadata.lastModified})`
      }
    } else {
      // Same timestamp - prefer higher version
      if (localMetadata.version > remoteMetadata.version) {
        return { resolution: 'local', reason: 'Higher local version' }
      } else {
        return { resolution: 'remote', reason: 'Higher remote version' }
      }
    }
  }
}

/**
 * Field-level Three-Way Merge Strategy
 */
export class ThreeWayMergeStrategy<T = Record<string, unknown>> implements ConflictResolutionStrategy<T> {
  name = 'three-way-merge'

  async resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    const { localData, remoteData } = context
    
    if (typeof localData !== 'object' || typeof remoteData !== 'object') {
      // Fall back to last writer wins for non-objects
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

  private resolveFieldConflict(field: string, localValue: unknown, remoteValue: unknown): unknown {
    // Prefer non-null values
    if (localValue != null && remoteValue == null) {
      return localValue
    }
    if (localValue == null && remoteValue != null) {
      return remoteValue
    }
    
    // For strings, prefer longer content (assuming it's more complete)
    if (typeof localValue === 'string' && typeof remoteValue === 'string') {
      return localValue.length > remoteValue.length ? localValue : remoteValue
    }
    
    // For numbers, prefer higher value (for things like counters)
    if (typeof localValue === 'number' && typeof remoteValue === 'number') {
      return Math.max(localValue, remoteValue)
    }
    
    // For arrays, merge and deduplicate
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      return Array.from(new Set([...localValue, ...remoteValue]))
    }
    
    // Default: prefer remote (server wins)
    return remoteValue
  }
}

/**
 * Operational Transform Strategy (for collaborative editing)
 */
export class OperationalTransformStrategy<T = unknown> implements ConflictResolutionStrategy<T> {
  name = 'operational-transform'

  async resolve(context: ConflictContext<T>): Promise<{ resolution: ConflictResolution; data?: T; reason?: string }> {
    // This is a simplified OT implementation
    // In production, you'd use a proper OT library like ShareJS or Y.js
    
    try {
      // For now, fall back to three-way merge
      const merger = new ThreeWayMergeStrategy<T>()
      const result = await merger.resolve(context)
      
      return {
        ...result,
        reason: `OT resolution (simplified): ${result.reason}`
      }
    } catch (error) {
      return {
        resolution: 'manual',
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
 * Main Conflict Resolver
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
    // Insert rule in priority order (higher priority first)
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
      localVersion: context.localMetadata.version,
      remoteVersion: context.remoteMetadata.version
    })

    // Find applicable rule
    const rule = this.findApplicableRule(context)
    
    if (rule) {
      try {
        const result = await rule.strategy.resolve(context)
        
        this.logger?.info('ConflictResolver resolution completed', {
          entityType: context.entityType,
          entityId: context.entityId,
          resolution: result.resolution,
          strategy: rule.strategy.name,
          reason: result.reason
        })
        
        return result
      } catch (error) {
        this.logger?.error('ConflictResolver strategy failed', error as Error, {
          entityType: context.entityType,
          entityId: context.entityId,
          strategy: rule.strategy.name
        })
        
        // Fall back to manual resolution
        return {
          resolution: 'manual',
          reason: `Strategy ${rule.strategy.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
    }

    // No specific rule found - use default strategy
    const defaultStrategy = this.strategies.get('last-writer-wins')!
    const result = await defaultStrategy.resolve(context)
    
    this.logger?.info('ConflictResolver used default strategy', {
      entityType: context.entityType,
      entityId: context.entityId,
      resolution: result.resolution,
      reason: result.reason
    })
    
    return result
  }

  /**
   * Find the most specific applicable rule for the conflict
   */
  private findApplicableRule<T>(context: ConflictContext<T>): ConflictRule<T> | null {
    for (const rule of this.rules) {
      // Check entity type match
      if (rule.entityType && rule.entityType !== context.entityType) {
        continue
      }
      
      // For now, we don't support field-level rules (would need field path analysis)
      if (rule.fieldPath) {
        continue
      }
      
      return rule as ConflictRule<T>
    }
    
    return null
  }

  /**
   * Get available strategies
   */
  getStrategies(): string[] {
    return Array.from(this.strategies.keys())
  }

  /**
   * Get active rules
   */
  getRules(): ConflictRule[] {
    return [...this.rules]
  }

  /**
   * Clear all rules (useful for testing)
   */
  clearRules(): void {
    this.rules.length = 0
    this.logger?.debug('ConflictResolver cleared all rules')
  }
}