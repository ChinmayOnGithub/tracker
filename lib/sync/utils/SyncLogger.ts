/**
 * Production Sync Logger
 * Structured logging with context and performance tracking
 */

import { SyncLogger } from '../types'

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  context?: Record<string, unknown>
  error?: Error
  timestamp: number
  component: string
}

interface TimingEntry {
  label: string
  startTime: number
  endTime?: number
  duration?: number
}

export class ProductionSyncLogger implements SyncLogger {
  private logs: LogEntry[] = []
  private metrics: Array<{ name: string; value: number; tags?: Record<string, string>; timestamp: number }> = []
  private timings = new Map<string, TimingEntry>()
  
  private readonly MAX_LOGS = 1000
  private readonly MAX_METRICS = 5000
  private component = 'SyncEngine'
  
  // External logging integration
  private externalLogger?: {
    log: (level: string, message: string, context?: Record<string, unknown>) => void
    metric: (name: string, value: number, tags?: Record<string, string>) => void
  }

  constructor(externalLogger?: {
    log: (level: string, message: string, context?: Record<string, unknown>) => void
    metric: (name: string, value: number, tags?: Record<string, string>) => void
  }) {
    this.externalLogger = externalLogger
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, context, error)
  }

  metric(name: string, value: number, tags?: Record<string, string>): void {
    const entry = {
      name,
      value,
      tags,
      timestamp: Date.now()
    }
    
    this.metrics.push(entry)
    
    // Limit metrics array size
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.splice(0, this.metrics.length - this.MAX_METRICS)
    }
    
    // Forward to external logger
    this.externalLogger?.metric(name, value, tags)
    
    // Console output in development
    if (process.env.NODE_ENV === 'development') {
      const tagsStr = tags ? ` ${JSON.stringify(tags)}` : ''
      console.log(`[METRIC] ${name}=${value}${tagsStr}`)
    }
  }

  startTiming(label: string): () => void {
    const entry: TimingEntry = {
      label,
      startTime: performance.now()
    }
    
    this.timings.set(label, entry)
    
    // Return end timing function
    return () => {
      const timing = this.timings.get(label)
      if (timing) {
        timing.endTime = performance.now()
        timing.duration = timing.endTime - timing.startTime
        
        this.metric(`timing.${label}`, timing.duration)
        this.debug(`Timing completed: ${label}`, {
          duration: timing.duration,
          startTime: timing.startTime,
          endTime: timing.endTime
        })
        
        this.timings.delete(label)
      }
    }
  }

  healthCheck(component: string, status: 'healthy' | 'degraded' | 'unhealthy', details?: Record<string, unknown>): void {
    this.info(`Health check: ${component}`, {
      component,
      status,
      ...details
    })
    
    this.metric('health.status', status === 'healthy' ? 1 : status === 'degraded' ? 0.5 : 0, {
      component
    })
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>, error?: Error): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      error,
      timestamp: Date.now(),
      component: this.component
    }
    
    this.logs.push(entry)
    
    // Limit logs array size
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.splice(0, this.logs.length - this.MAX_LOGS)
    }
    
    // Forward to external logger
    this.externalLogger?.log(level, message, { ...context, error: error?.message, component: this.component })
    
    // Console output
    this.logToConsole(entry)
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    const errorStr = entry.error ? ` Error: ${entry.error.message}` : ''
    
    const logMessage = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.component}] ${entry.message}${contextStr}${errorStr}`
    
    switch (entry.level) {
      case 'debug':
        console.debug(logMessage)
        break
      case 'info':
        console.info(logMessage)
        break
      case 'warn':
        console.warn(logMessage)
        break
      case 'error':
        console.error(logMessage)
        if (entry.error?.stack) {
          console.error(entry.error.stack)
        }
        break
    }
  }

  // Query and analysis methods
  getLogs(level?: 'debug' | 'info' | 'warn' | 'error', since?: number): LogEntry[] {
    let filtered = this.logs
    
    if (level) {
      filtered = filtered.filter(log => log.level === level)
    }
    
    if (since) {
      filtered = filtered.filter(log => log.timestamp > since)
    }
    
    return filtered.slice() // Return copy
  }

  getMetrics(name?: string, since?: number): Array<{ name: string; value: number; tags?: Record<string, string>; timestamp: number }> {
    let filtered = this.metrics
    
    if (name) {
      filtered = filtered.filter(metric => metric.name === name)
    }
    
    if (since) {
      filtered = filtered.filter(metric => metric.timestamp > since)
    }
    
    return filtered.slice() // Return copy
  }

  getActiveTimings(): TimingEntry[] {
    return Array.from(this.timings.values())
  }

  // Statistics and summaries
  getLogStats(windowMs = 300000): { // 5 minutes default
    total: number
    byLevel: Record<string, number>
    errorRate: number
    recentErrors: LogEntry[]
  } {
    const since = Date.now() - windowMs
    const recentLogs = this.getLogs(undefined, since)
    
    const byLevel = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    }
    
    for (const log of recentLogs) {
      byLevel[log.level]++
    }
    
    const total = recentLogs.length
    const errorRate = total > 0 ? (byLevel.error / total) * 100 : 0
    
    return {
      total,
      byLevel,
      errorRate,
      recentErrors: this.getLogs('error', since).slice(-10) // Last 10 errors
    }
  }

  getMetricStats(windowMs = 300000): {
    total: number
    uniqueMetrics: number
    averageValue: number
    byName: Record<string, { count: number; avg: number; min: number; max: number }>
  } {
    const since = Date.now() - windowMs
    const recentMetrics = this.getMetrics(undefined, since)
    
    const byName: Record<string, { count: number; avg: number; min: number; max: number }> = {}
    
    for (const metric of recentMetrics) {
      if (!byName[metric.name]) {
        byName[metric.name] = {
          count: 0,
          avg: 0,
          min: metric.value,
          max: metric.value
        }
      }
      
      const stats = byName[metric.name]
      stats.count++
      stats.min = Math.min(stats.min, metric.value)
      stats.max = Math.max(stats.max, metric.value)
    }
    
    // Calculate averages
    for (const name in byName) {
      const values = recentMetrics.filter(m => m.name === name).map(m => m.value)
      byName[name].avg = values.reduce((sum, val) => sum + val, 0) / values.length
    }
    
    const total = recentMetrics.length
    const uniqueMetrics = Object.keys(byName).length
    const averageValue = total > 0 
      ? recentMetrics.reduce((sum, m) => sum + m.value, 0) / total 
      : 0
    
    return {
      total,
      uniqueMetrics,
      averageValue,
      byName
    }
  }

  // Export for external analysis
  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = 'timestamp,level,component,message,context,error\n'
      const rows = this.logs.map(log => {
        const context = log.context ? JSON.stringify(log.context).replace(/"/g, '""') : ''
        const error = log.error?.message || ''
        return `${log.timestamp},${log.level},${log.component},"${log.message}","${context}","${error}"`
      }).join('\n')
      
      return headers + rows
    }
    
    return JSON.stringify(this.logs, null, 2)
  }

  // Cleanup
  clear(): void {
    this.logs.length = 0
    this.metrics.length = 0
    this.timings.clear()
  }

  destroy(): void {
    this.clear()
  }
}