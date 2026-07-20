/**
 * Production Network Manager
 * Comprehensive network monitoring with flapping protection and quality assessment
 */

import { NetworkStatus, SyncEventMap, ConnectionQuality, SyncLogger } from '../types'
import { EventEmitter } from '../utils/EventEmitter'

interface NetworkSample {
  timestamp: number
  online: boolean
  latency?: number
  error?: string
}

interface FlappingDetection {
  windowStart: number
  transitions: number
  lastState: boolean
  suppressUntil: number
}

export class NetworkManager extends EventEmitter<SyncEventMap> {
  private currentStatus: NetworkStatus = 'offline'
  private connectionQuality: ConnectionQuality = {
    latency: 0,
    bandwidth: 0,
    reliability: 0,
    lastTested: 0
  }
  
  private samples: NetworkSample[] = []
  private checkInterval?: NodeJS.Timeout
  private qualityInterval?: NodeJS.Timeout
  
  // Flapping detection
  private flapping: FlappingDetection = {
    windowStart: 0,
    transitions: 0,
    lastState: false,
    suppressUntil: 0
  }
  
  // Configuration
  private readonly CHECK_INTERVAL = 15000 // 15 seconds
  private readonly QUALITY_INTERVAL = 60000 // 1 minute
  private readonly PING_TIMEOUT = 8000 // 8 seconds
  private readonly SAMPLE_WINDOW = 300000 // 5 minutes
  private readonly MAX_SAMPLES = 100
  private readonly FLAP_THRESHOLD = 5 // transitions per minute
  private readonly FLAP_SUPPRESS_DURATION = 120000 // 2 minutes
  
  private logger?: SyncLogger
  private endpoints: string[] = []
  private abortController?: AbortController
  private browserEventCleanup?: () => void

  constructor(endpoints: string[] = ['/api/sync/health'], logger?: SyncLogger) {
    super()
    this.endpoints = endpoints
    this.logger = logger
    this.startMonitoring()
  }

  private startMonitoring(): void {
    this.logger?.info('NetworkManager starting monitoring')
    
    // Initial check
    this.performConnectivityCheck()
    
    // Periodic connectivity checks
    this.checkInterval = setInterval(() => {
      this.performConnectivityCheck()
    }, this.CHECK_INTERVAL)
    
    // Periodic quality assessment
    this.qualityInterval = setInterval(() => {
      this.assessConnectionQuality()
    }, this.QUALITY_INTERVAL)
    
    // Browser online/offline events (when available)
    // Fixed: Proper cleanup function storage
    if (typeof window !== 'undefined') {
      const handleOnline = () => this.handleBrowserEvent(true)
      const handleOffline = () => this.handleBrowserEvent(false)
      
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      
      // Store proper cleanup function
      this.browserEventCleanup = () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }

  private async performConnectivityCheck(): Promise<void> {
    if (Date.now() < this.flapping.suppressUntil) {
      this.logger?.debug('NetworkManager connectivity check suppressed due to flapping')
      return
    }

    this.abortController?.abort()
    this.abortController = new AbortController()
    
    const startTime = Date.now()
    const sample: NetworkSample = {
      timestamp: startTime,
      online: false
    }

    try {
      const results = await Promise.allSettled(
        this.endpoints.map(endpoint => this.pingEndpoint(endpoint, this.abortController!.signal))
      )
      
      // Consider online if any endpoint responds successfully
      const successfulPings = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<number>[]
      
      if (successfulPings.length > 0) {
        const avgLatency = successfulPings.reduce((sum, result) => sum + result.value, 0) / successfulPings.length
        sample.online = true
        sample.latency = avgLatency
        
        this.updateConnectionQuality(avgLatency, true)
      } else {
        // All endpoints failed
        const errors = results
          .filter(result => result.status === 'rejected')
          .map(result => (result as PromiseRejectedResult).reason.message)
        
        sample.error = errors.join(', ')
        this.updateConnectionQuality(0, false)
      }
    } catch (error) {
      sample.error = error instanceof Error ? error.message : 'Unknown error'
      this.updateConnectionQuality(0, false)
    }

    this.addSample(sample)
    this.updateNetworkStatus(sample)
  }

  private async pingEndpoint(endpoint: string, signal: AbortSignal): Promise<number> {
    const startTime = Date.now()
    
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal,
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return Date.now() - startTime
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout')
      }
      throw error
    }
  }

  private handleBrowserEvent(online: boolean): void {
    this.logger?.debug('NetworkManager browser event', { online })
    
    // Don't immediately trust browser events, but trigger a check
    if (online) {
      // Delay slightly to let network settle
      setTimeout(() => this.performConnectivityCheck(), 1000)
    } else {
      // Offline events are usually reliable
      this.updateNetworkStatus({ timestamp: Date.now(), online: false })
    }
  }

  private addSample(sample: NetworkSample): void {
    this.samples.push(sample)
    
    // Remove old samples
    const cutoff = Date.now() - this.SAMPLE_WINDOW
    this.samples = this.samples.filter(s => s.timestamp > cutoff)
    
    // Limit sample count
    if (this.samples.length > this.MAX_SAMPLES) {
      this.samples = this.samples.slice(-this.MAX_SAMPLES)
    }
  }

  private updateNetworkStatus(sample: NetworkSample): void {
    const wasOnline = this.currentStatus === 'online' || this.currentStatus === 'limited'
    const isOnline = sample.online
    
    // Detect state changes for flapping detection
    if (wasOnline !== isOnline) {
      this.detectFlapping(isOnline)
    }
    
    if (Date.now() < this.flapping.suppressUntil) {
      this.logger?.debug('NetworkManager status change suppressed due to flapping')
      return
    }

    const previousStatus = this.currentStatus
    
    if (sample.online) {
      // Determine connection quality
      if (sample.latency && sample.latency < 500) {
        this.currentStatus = 'online'
      } else {
        this.currentStatus = 'limited'
      }
    } else {
      this.currentStatus = 'offline'
    }
    
    if (this.currentStatus !== previousStatus) {
      this.logger?.info('NetworkManager status changed', {
        from: previousStatus,
        to: this.currentStatus,
        latency: sample.latency,
        reliability: this.connectionQuality.reliability
      })
      
      this.emit('network:statusChanged', {
        status: this.currentStatus,
        previousStatus
      })
      
      if (this.currentStatus === 'online' && previousStatus === 'offline') {
        const downtime = this.getDowntimeDuration()
        this.emit('network:reconnected', {
          downtime,
          queueSize: 0 // This would be provided by the sync engine
        })
      }
    }
  }

  private detectFlapping(newState: boolean): void {
    const now = Date.now()
    const windowDuration = 60000 // 1 minute window
    
    // Reset window if it's been too long
    if (now - this.flapping.windowStart > windowDuration) {
      this.flapping.windowStart = now
      this.flapping.transitions = 0
    }
    
    // Count transition if state actually changed
    if (this.flapping.lastState !== newState) {
      this.flapping.transitions++
      this.flapping.lastState = newState
    }
    
    // Check for flapping
    if (this.flapping.transitions >= this.FLAP_THRESHOLD) {
      this.logger?.warn('NetworkManager flapping detected', {
        transitions: this.flapping.transitions,
        windowDuration: now - this.flapping.windowStart
      })
      
      this.flapping.suppressUntil = now + this.FLAP_SUPPRESS_DURATION
      this.currentStatus = 'flapping'
      
      this.emit('network:flapping', {
        count: this.flapping.transitions,
        duration: now - this.flapping.windowStart
      })
    }
  }

  private updateConnectionQuality(latency: number, success: boolean): void {
    const now = Date.now()
    
    // Update reliability based on recent success rate
    const recentSamples = this.samples.filter(s => s.timestamp > now - 60000) // Last minute
    const successRate = recentSamples.length > 0 
      ? recentSamples.filter(s => s.online).length / recentSamples.length 
      : (success ? 1 : 0)
    
    // Estimate bandwidth (very rough approximation)
    const estimatedBandwidth = success && latency > 0 
      ? Math.max(1000000 / latency, 56000) // Rough estimate
      : this.connectionQuality.bandwidth * 0.9 // Decay if offline
    
    this.connectionQuality = {
      latency: success ? latency : this.connectionQuality.latency,
      bandwidth: estimatedBandwidth,
      reliability: successRate,
      lastTested: now
    }
  }

  private assessConnectionQuality(): void {
    const recentSamples = this.samples.filter(s => s.timestamp > Date.now() - 300000) // Last 5 minutes
    
    if (recentSamples.length === 0) return
    
    const onlineSamples = recentSamples.filter(s => s.online && s.latency)
    const avgLatency = onlineSamples.length > 0
      ? onlineSamples.reduce((sum, s) => sum + s.latency!, 0) / onlineSamples.length
      : 0
    
    const reliability = recentSamples.filter(s => s.online).length / recentSamples.length
    
    this.logger?.metric('network_latency', avgLatency, { status: this.currentStatus })
    this.logger?.metric('network_reliability', reliability * 100, { status: this.currentStatus })
  }

  private getDowntimeDuration(): number {
    const lastOnlineSample = [...this.samples].reverse().find(s => s.online)
    const firstOfflineSample = this.samples.find(s => !s.online && (!lastOnlineSample || s.timestamp > lastOnlineSample.timestamp))
    
    if (!firstOfflineSample) return 0
    
    return Date.now() - firstOfflineSample.timestamp
  }

  // Public API
  getStatus(): NetworkStatus {
    return this.currentStatus
  }

  isOnline(): boolean {
    return this.currentStatus === 'online' || this.currentStatus === 'limited'
  }

  getConnectionQuality(): ConnectionQuality {
    return { ...this.connectionQuality }
  }

  async ping(): Promise<number> {
    if (this.endpoints.length === 0) {
      throw new Error('No endpoints configured for ping')
    }
    
    const signal = AbortSignal.timeout(this.PING_TIMEOUT)
    return this.pingEndpoint(this.endpoints[0], signal)
  }

  async waitForConnection(timeout = 30000): Promise<boolean> {
    if (this.isOnline()) {
      return true
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        unsubscribe()
        resolve(false)
      }, timeout)

      const unsubscribe = this.on('network:statusChanged', ({ status }) => {
        if (status === 'online' || status === 'limited') {
          clearTimeout(timeoutId)
          unsubscribe()
          resolve(true)
        }
      })
    })
  }

  // Force an immediate connectivity check
  async forceCheck(): Promise<void> {
    await this.performConnectivityCheck()
  }

  // Get network statistics
  getStats() {
    const now = Date.now()
    const recentSamples = this.samples.filter(s => s.timestamp > now - 300000) // Last 5 minutes
    
    return {
      status: this.currentStatus,
      quality: this.connectionQuality,
      samples: {
        total: this.samples.length,
        recent: recentSamples.length,
        successRate: recentSamples.length > 0 
          ? recentSamples.filter(s => s.online).length / recentSamples.length 
          : 0
      },
      flapping: {
        isSupressed: now < this.flapping.suppressUntil,
        transitions: this.flapping.transitions,
        suppressedUntil: this.flapping.suppressUntil
      }
    }
  }

  destroy(): void {
    this.logger?.info('NetworkManager shutting down')
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
    
    if (this.qualityInterval) {
      clearInterval(this.qualityInterval)
    }
    
    this.abortController?.abort()
    
    // Cleanup browser events using stored cleanup function
    if (this.browserEventCleanup) {
      this.browserEventCleanup()
      this.browserEventCleanup = undefined
    }
    
    this.removeAllListeners()
  }
}