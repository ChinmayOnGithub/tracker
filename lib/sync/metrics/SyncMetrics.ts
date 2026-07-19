/**
 * Production Sync Metrics Collection
 * Comprehensive metrics and observability for sync operations
 */

import { SyncMetrics, SyncLogger, OperationPriority, ErrorCategory } from '../types'

interface MetricSample {
  timestamp: number
  value: number
  tags?: Record<string, string>
}

interface OperationMetrics {
  duration: number
  queueTime: number
  retries: number
  success: boolean
  errorCategory?: ErrorCategory
}

export class SyncMetricsCollector {
  private logger?: SyncLogger
  private samples = new Map<string, MetricSample[]>()
  private operationMetrics: OperationMetrics[] = []
  private counters = new Map<string, number>()
  
  // Rolling windows for different time periods
  private readonly SAMPLE_RETENTION = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000
  }
  
  private readonly MAX_SAMPLES_PER_METRIC = 1000
  private cleanupInterval?: NodeJS.Timeout

  constructor(logger?: SyncLogger) {
    this.logger = logger
    
    // Initialize counters
    this.resetCounters()
    
    // Setup periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000) // Cleanup every minute
  }

  /**
   * Record a metric sample
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const sample: MetricSample = {
      timestamp: Date.now(),
      value,
      tags
    }
    
    if (!this.samples.has(name)) {
      this.samples.set(name, [])
    }
    
    const samples = this.samples.get(name)!
    samples.push(sample)
    
    // Limit sample count
    if (samples.length > this.MAX_SAMPLES_PER_METRIC) {
      samples.splice(0, samples.length - this.MAX_SAMPLES_PER_METRIC)
    }
    
    // Send to logger
    this.logger?.metric(name, value, tags)
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value = 1, tags?: Record<string, string>): void {
    const key = tags ? `${name}:${JSON.stringify(tags)}` : name
    const current = this.counters.get(key) || 0
    this.counters.set(key, current + value)
    
    this.logger?.metric(name, current + value, tags)
  }

  /**
   * Record operation timing and outcome
   */
  recordOperation(metrics: OperationMetrics): void {
    this.operationMetrics.push(metrics)
    
    // Keep only recent operations (last 1000)
    if (this.operationMetrics.length > 1000) {
      this.operationMetrics.splice(0, this.operationMetrics.length - 1000)
    }
    
    // Record individual metrics
    this.recordMetric('operation.duration', metrics.duration)
    this.recordMetric('operation.queue_time', metrics.queueTime)
    this.recordMetric('operation.retries', metrics.retries)
    
    if (metrics.success) {
      this.incrementCounter('operations.success')
    } else {
      this.incrementCounter('operations.failed')
      if (metrics.errorCategory) {
        this.incrementCounter('operations.error', 1, { category: metrics.errorCategory })
      }
    }
  }

  /**
   * Get aggregated metrics for the specified time window
   */
  getMetrics(windowMs = this.SAMPLE_RETENTION['5m']): SyncMetrics {
    const now = Date.now()
    const cutoff = now - windowMs
    
    const recentOperations = this.operationMetrics.filter(op => 
      (now - op.duration) > cutoff // Approximate timing
    )
    
    // Calculate operation metrics
    const totalOperations = recentOperations.length
    const successfulOperations = recentOperations.filter(op => op.success).length
    const failedOperations = totalOperations - successfulOperations
    
    // Calculate queue metrics
    const queueTimes = recentOperations.map(op => op.queueTime).filter(t => t > 0)
    const averageQueueTime = queueTimes.length > 0 
      ? queueTimes.reduce((sum, time) => sum + time, 0) / queueTimes.length
      : 0
    
    // Calculate error metrics by category
    const errorsByCategory: Record<ErrorCategory, number> = {
      network: 0,
      conflict: 0,
      validation: 0,
      authorization: 0,
      rate_limit: 0,
      internal: 0,
      unknown: 0
    }
    
    for (const op of recentOperations) {
      if (!op.success && op.errorCategory) {
        errorsByCategory[op.errorCategory]++
      }
    }
    
    // Calculate performance metrics
    const durations = recentOperations.map(op => op.duration)
    const averageOperationDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0
    
    const retries = recentOperations.map(op => op.retries)
    const retryRate = retries.length > 0
      ? retries.reduce((sum, r) => sum + r, 0) / retries.length
      : 0
    
    // Get current counter values
    const queueSize = this.getCounterValue('queue.size')
    const peakQueueSize = this.getMetricMax('queue.size', windowMs)
    
    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      cancelledOperations: this.getCounterValue('operations.cancelled'),
      
      queueSize,
      averageQueueTime,
      oldestQueuedOperation: this.getMetricMin('operation.queued_at', windowMs),
      
      networkStatus: 'online', // This would come from NetworkManager
      averageLatency: this.getMetricAverage('network.latency', windowMs),
      successRate: totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 100,
      lastSyncTime: this.getCounterValue('sync.last_completed'),
      
      errorsByCategory,
      retryRate,
      
      averageOperationDuration,
      peakQueueSize,
      memoryUsage: this.getMemoryUsage(),
      
      storageSize: this.getCounterValue('storage.size'),
      metadataSize: this.getCounterValue('storage.metadata_size'),
      
      timestamp: now
    }
  }

  /**
   * Get counter value by name
   */
  private getCounterValue(name: string): number {
    return this.counters.get(name) || 0
  }

  /**
   * Get average value for a metric over time window
   */
  private getMetricAverage(name: string, windowMs: number): number {
    const samples = this.getSamplesInWindow(name, windowMs)
    if (samples.length === 0) return 0
    
    const sum = samples.reduce((total, sample) => total + sample.value, 0)
    return sum / samples.length
  }

  /**
   * Get maximum value for a metric over time window
   */
  private getMetricMax(name: string, windowMs: number): number {
    const samples = this.getSamplesInWindow(name, windowMs)
    if (samples.length === 0) return 0
    
    return Math.max(...samples.map(s => s.value))
  }

  /**
   * Get minimum value for a metric over time window
   */
  private getMetricMin(name: string, windowMs: number): number {
    const samples = this.getSamplesInWindow(name, windowMs)
    if (samples.length === 0) return 0
    
    return Math.min(...samples.map(s => s.value))
  }

  /**
   * Get samples within time window
   */
  private getSamplesInWindow(name: string, windowMs: number): MetricSample[] {
    const samples = this.samples.get(name) || []
    const cutoff = Date.now() - windowMs
    
    return samples.filter(sample => sample.timestamp > cutoff)
  }

  /**
   * Get current memory usage (approximate)
   */
  private getMemoryUsage(): number {
    // Approximate memory usage calculation
    let usage = 0
    
    // Count samples
    for (const samples of this.samples.values()) {
      usage += samples.length * 100 // Rough estimate per sample
    }
    
    // Count operations
    usage += this.operationMetrics.length * 200 // Rough estimate per operation
    
    // Count counters
    usage += this.counters.size * 50
    
    return usage
  }

  /**
   * Clean up old samples and metrics
   */
  private cleanup(): void {
    const now = Date.now()
    
    // Clean up old samples
    for (const [name, samples] of this.samples.entries()) {
      const cutoff = now - this.SAMPLE_RETENTION['1h']
      const filtered = samples.filter(sample => sample.timestamp > cutoff)
      this.samples.set(name, filtered)
    }
    
    // Clean up old operation metrics
    const opCutoff = now - this.SAMPLE_RETENTION['1h']
    this.operationMetrics = this.operationMetrics.filter(op => 
      (now - op.duration) > opCutoff
    )
    
    this.logger?.debug('SyncMetrics cleanup completed', {
      samplesCount: Array.from(this.samples.values()).reduce((sum, samples) => sum + samples.length, 0),
      operationsCount: this.operationMetrics.length,
      countersCount: this.counters.size
    })
  }

  /**
   * Reset all counters
   */
  private resetCounters(): void {
    this.counters.clear()
    
    // Initialize common counters
    this.counters.set('operations.success', 0)
    this.counters.set('operations.failed', 0)
    this.counters.set('operations.cancelled', 0)
    this.counters.set('queue.size', 0)
    this.counters.set('sync.last_completed', 0)
    this.counters.set('storage.size', 0)
    this.counters.set('storage.metadata_size', 0)
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(): Record<string, any> {
    const metrics = this.getMetrics()
    const samples: Record<string, MetricSample[]> = {}
    
    // Export recent samples
    for (const [name, sampleArray] of this.samples.entries()) {
      const recent = this.getSamplesInWindow(name, this.SAMPLE_RETENTION['5m'])
      if (recent.length > 0) {
        samples[name] = recent
      }
    }
    
    return {
      metrics,
      samples,
      counters: Object.fromEntries(this.counters.entries())
    }
  }

  /**
   * Generate health report
   */
  getHealthReport(): { status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] } {
    const metrics = this.getMetrics()
    const issues: string[] = []
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    
    // Check error rate
    if (metrics.successRate < 95) {
      issues.push(`Low success rate: ${metrics.successRate.toFixed(1)}%`)
      status = 'degraded'
    }
    
    if (metrics.successRate < 80) {
      status = 'unhealthy'
    }
    
    // Check queue size
    if (metrics.queueSize > 1000) {
      issues.push(`High queue size: ${metrics.queueSize}`)
      status = 'degraded'
    }
    
    if (metrics.queueSize > 5000) {
      status = 'unhealthy'
    }
    
    // Check average queue time
    if (metrics.averageQueueTime > 30000) { // 30 seconds
      issues.push(`High queue wait time: ${(metrics.averageQueueTime / 1000).toFixed(1)}s`)
      status = 'degraded'
    }
    
    // Check memory usage
    if (metrics.memoryUsage > 50 * 1024 * 1024) { // 50MB
      issues.push(`High memory usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB`)
      status = 'degraded'
    }
    
    return { status, issues }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    
    this.samples.clear()
    this.operationMetrics.length = 0
    this.counters.clear()
  }
}