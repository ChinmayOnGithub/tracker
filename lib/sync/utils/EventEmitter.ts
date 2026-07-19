/**
 * Type-safe Event Emitter
 * Provides strongly-typed event emission and subscription
 */

export type EventListener<T = unknown> = (data: T) => void | Promise<void>

export class EventEmitter<TEventMap extends Record<string, unknown> = Record<string, unknown>> {
  private listeners = new Map<keyof TEventMap, Set<EventListener>>()

  on<K extends keyof TEventMap>(
    event: K,
    listener: EventListener<TEventMap[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    const eventListeners = this.listeners.get(event)!
    eventListeners.add(listener as EventListener)

    // Return unsubscribe function
    return () => {
      eventListeners.delete(listener as EventListener)
    }
  }

  once<K extends keyof TEventMap>(
    event: K,
    listener: EventListener<TEventMap[K]>
  ): () => void {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe()
      listener(data)
    })
    return unsubscribe
  }

  emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
    const eventListeners = this.listeners.get(event)
    if (!eventListeners) return

    // Execute listeners asynchronously to prevent blocking
    Promise.resolve().then(async () => {
      const promises = Array.from(eventListeners).map(async (listener) => {
        try {
          await listener(data)
        } catch (error) {
          console.error(`Event listener error for event ${String(event)}:`, error)
        }
      })

      await Promise.all(promises)
    })
  }

  off<K extends keyof TEventMap>(
    event: K,
    listener?: EventListener<TEventMap[K]>
  ): void {
    const eventListeners = this.listeners.get(event)
    if (!eventListeners) return

    if (listener) {
      eventListeners.delete(listener as EventListener)
    } else {
      eventListeners.clear()
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }

  listenerCount<K extends keyof TEventMap>(event: K): number {
    const eventListeners = this.listeners.get(event)
    return eventListeners?.size || 0
  }

  eventNames(): (keyof TEventMap)[] {
    return Array.from(this.listeners.keys())
  }
}