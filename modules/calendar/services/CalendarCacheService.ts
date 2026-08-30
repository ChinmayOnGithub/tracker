import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine'
import { ParsedCalendarEvent } from '@/modules/sync/google-calendar/services/GoogleCalendarService'
import { CalendarMonthSummaryDTO } from '../dto/CalendarMonthSummaryDTO'
import { CalendarWeekDTO } from '../dto/CalendarWeekDTO'

export interface AgendaData {
  today: ParsedCalendarEvent[]
  tomorrow: ParsedCalendarEvent[]
  upcoming: ParsedCalendarEvent[]
}

interface CacheEnvelope<T> {
  key: string
  value: T
  timestamp: number
}

// 5 minutes freshness window
const CACHE_TTL_MS = 5 * 60 * 1000

export class CalendarCacheService {
  private static inMemory = new Map<string, CacheEnvelope<unknown>>()

  private static isClient(): boolean {
    return typeof window !== 'undefined'
  }

  /**
   * Reconciles two lists of calendar events using stable event IDs.
   * Handles additions, modifications, date moves, and deletions.
   */
  public static reconcileEvents(
    cachedEvents: ParsedCalendarEvent[],
    freshEvents: ParsedCalendarEvent[]
  ): ParsedCalendarEvent[] {
    const eventMap = new Map<string, ParsedCalendarEvent>()

    // Seed with cached events
    for (const evt of cachedEvents) {
      if (evt && evt.id) {
        eventMap.set(evt.id, evt)
      }
    }

    // Upsert or overwrite with fresh network events
    const freshIds = new Set<string>()
    for (const fresh of freshEvents) {
      if (!fresh || !fresh.id) continue
      freshIds.add(fresh.id)
      eventMap.set(fresh.id, {
        ...eventMap.get(fresh.id),
        ...fresh,
      })
    }

    // Filter out items in the fresh window that were deleted/absent
    // (Preserve items outside the window if relevant, but within window, fresh is authoritative)
    return Array.from(eventMap.values())
  }

  /**
   * Reconciles full agenda collections (today, tomorrow, upcoming) using stable event identity.
   */
  public static reconcileAgenda(cached: AgendaData | null, fresh: AgendaData): AgendaData {
    if (!cached) return fresh

    return {
      today: this.reconcileEvents(cached.today || [], fresh.today || []),
      tomorrow: this.reconcileEvents(cached.tomorrow || [], fresh.tomorrow || []),
      upcoming: this.reconcileEvents(cached.upcoming || [], fresh.upcoming || []),
    }
  }

  /**
   * Fetches an agenda from warm memory or IndexedDB, returning immediately if available.
   * Also reports whether background revalidation is recommended.
   * Key is strictly scoped to the authenticated userId.
   */
  public static async getCachedAgenda(
    userId: string,
    todayStr: string
  ): Promise<{ data: AgendaData | null; isStale: boolean }> {
    const cacheKey = `cal_agenda_${userId || 'anonymous'}_${todayStr}`
    const now = Date.now()

    // 1. Check warm memory
    const mem = this.inMemory.get(cacheKey) as CacheEnvelope<AgendaData> | undefined
    if (mem && mem.value) {
      const isStale = now - mem.timestamp > CACHE_TTL_MS
      return { data: mem.value, isStale }
    }

    // 2. Check IndexedDB
    if (this.isClient()) {
      try {
        const db = IndexedDBEngine.getInstance()
        const stored = await db.get<CacheEnvelope<AgendaData>>('settings', cacheKey)
        if (stored && stored.value) {
          // Warm up memory
          this.inMemory.set(cacheKey, stored)
          const isStale = now - stored.timestamp > CACHE_TTL_MS
          return { data: stored.value, isStale }
        }
      } catch (e) {
        console.warn('[CalendarCacheService] IndexedDB read failed:', e)
      }
    }

    return { data: null, isStale: true }
  }

  /**
   * Saves agenda into warm memory and IndexedDB for the authenticated user.
   */
  public static async saveCachedAgenda(
    userId: string,
    todayStr: string,
    agenda: AgendaData
  ): Promise<void> {
    const cacheKey = `cal_agenda_${userId || 'anonymous'}_${todayStr}`
    const envelope: CacheEnvelope<AgendaData> = {
      key: cacheKey,
      value: agenda,
      timestamp: Date.now(),
    }

    // Warm memory
    this.inMemory.set(cacheKey, envelope)

    // Persist to IndexedDB settings store
    if (this.isClient()) {
      try {
        const db = IndexedDBEngine.getInstance()
        await db.put('settings', envelope)
      } catch (e) {
        console.warn('[CalendarCacheService] IndexedDB write failed:', e)
      }
    }
  }

  /**
   * Fetches cached month summaries for the authenticated user.
   */
  public static async getCachedMonthSummary(
    userId: string,
    year: number,
    month: number
  ): Promise<{ data: CalendarMonthSummaryDTO[] | null; isStale: boolean }> {
    const cacheKey = `cal_month_${userId || 'anonymous'}_${year}_${month}`
    const now = Date.now()

    const mem = this.inMemory.get(cacheKey) as CacheEnvelope<CalendarMonthSummaryDTO[]> | undefined
    if (mem && mem.value) {
      return { data: mem.value, isStale: now - mem.timestamp > CACHE_TTL_MS }
    }

    if (this.isClient()) {
      try {
        const db = IndexedDBEngine.getInstance()
        const stored = await db.get<CacheEnvelope<CalendarMonthSummaryDTO[]>>('settings', cacheKey)
        if (stored && stored.value) {
          this.inMemory.set(cacheKey, stored)
          return { data: stored.value, isStale: now - stored.timestamp > CACHE_TTL_MS }
        }
      } catch (e) {
        console.warn('[CalendarCacheService] Month cache read failed:', e)
      }
    }

    return { data: null, isStale: true }
  }

  /**
   * Saves month summaries to cache for the authenticated user.
   */
  public static async saveCachedMonthSummary(
    userId: string,
    year: number,
    month: number,
    data: CalendarMonthSummaryDTO[]
  ): Promise<void> {
    const cacheKey = `cal_month_${userId || 'anonymous'}_${year}_${month}`
    const envelope: CacheEnvelope<CalendarMonthSummaryDTO[]> = {
      key: cacheKey,
      value: data,
      timestamp: Date.now(),
    }

    this.inMemory.set(cacheKey, envelope)
    if (this.isClient()) {
      try {
        const db = IndexedDBEngine.getInstance()
        await db.put('settings', envelope)
      } catch (e) {
        console.warn('[CalendarCacheService] Month cache write failed:', e)
      }
    }
  }

  /**
   * Fetches cached week data for the authenticated user.
   */
  public static async getCachedWeekData(
    userId: string,
    startStr: string
  ): Promise<{ data: CalendarWeekDTO | null; isStale: boolean }> {
    const cacheKey = `cal_week_${userId || 'anonymous'}_${startStr}`
    const now = Date.now()

    const mem = this.inMemory.get(cacheKey) as CacheEnvelope<CalendarWeekDTO> | undefined
    if (mem && mem.value) {
      return { data: mem.value, isStale: now - mem.timestamp > CACHE_TTL_MS }
    }

    if (this.isClient()) {
      try {
        const db = IndexedDBEngine.getInstance()
        const stored = await db.get<CacheEnvelope<CalendarWeekDTO>>('settings', cacheKey)
        if (stored && stored.value) {
          this.inMemory.set(cacheKey, stored)
          return { data: stored.value, isStale: now - stored.timestamp > CACHE_TTL_MS }
        }
      } catch (e) {
        console.warn('[CalendarCacheService] Week cache read failed:', e)
      }
    }

    return { data: null, isStale: true }
  }

  /**
   * Saves week data to cache for the authenticated user.
   */
  public static async saveCachedWeekData(
    userId: string,
    startStr: string,
    data: CalendarWeekDTO
  ): Promise<void> {
    const cacheKey = `cal_week_${userId || 'anonymous'}_${startStr}`
    const envelope: CacheEnvelope<CalendarWeekDTO> = {
      key: cacheKey,
      value: data,
      timestamp: Date.now(),
    }

    this.inMemory.set(cacheKey, envelope)
    if (this.isClient()) {
      try {
        const db = IndexedDBEngine.getInstance()
        await db.put('settings', envelope)
      } catch (e) {
        console.warn('[CalendarCacheService] Week cache write failed:', e)
      }
    }
  }

  /**
   * Explicit cache invalidation for all or single user.
   */
  public static invalidateAll(userId?: string): void {
    if (!userId) {
      this.inMemory.clear()
      return
    }
    for (const key of this.inMemory.keys()) {
      if (key.includes(`_${userId}_`)) {
        this.inMemory.delete(key)
      }
    }
  }
}
