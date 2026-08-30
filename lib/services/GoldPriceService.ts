/**
 * GoldPriceService
 * 
 * Clean integration service for compact market reference gold rates in INR/gram.
 * Uses 4-hour local caching and fallback estimates so Today never blocks or fails.
 */

export interface GoldPriceSnapshot {
  pricePerGram24K: number
  pricePer10Gram24K: number
  currency: string
  dailyChangePct?: number
  timestamp: number
  isReferencePrice: boolean
}

const GOLD_CACHE_KEY = 'tracker_gold_price_snapshot_v3'
const GOLD_CACHE_TTL = 2 * 60 * 60 * 1000 // 2 hours

export class GoldPriceService {
  /**
   * Retrieves cached gold price snapshot if valid.
   */
  static getCachedSnapshot(): GoldPriceSnapshot | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(GOLD_CACHE_KEY)
      if (!raw) return null
      const parsed: GoldPriceSnapshot = JSON.parse(raw)
      if (Date.now() - parsed.timestamp < GOLD_CACHE_TTL) {
        return parsed
      }
    } catch {
      // Ignore cache parse error
    }
    return null
  }

  /**
   * Fetches latest 24K gold market rate in INR per 10 grams directly from real-time API.
   */
  static async fetchGoldPrice(): Promise<GoldPriceSnapshot | null> {
    try {
      const cached = this.getCachedSnapshot()
      if (cached) return cached

      let pricePerGram: number | null = null
      let isReferencePrice = false

      // 1. Primary Live Feed: Real-time XAU/INR Spot API
      try {
        const liveRes = await fetch('https://api.gold-api.com/price/XAU/INR')
        if (liveRes.ok) {
          const liveData = await liveRes.json()
          const xauInr = Number(liveData.price)
          if (xauInr && xauInr > 100000) {
            // 1 troy ounce = 31.1034768 grams + standard import duties/local retail benchmark adjustment (~10-12%)
            const spotPerGram = xauInr / 31.1034768
            const retailPerGram = Math.round(spotPerGram * 1.10)
            pricePerGram = retailPerGram
          }
        }
      } catch (e) {
        console.warn('[GoldPriceService] Primary gold API unreachable, trying secondary source:', e)
      }

      // 2. Secondary Fallback Feed: XAU/USD * live USD/INR exchange rate
      if (!pricePerGram) {
        try {
          const [xauRes, forexRes] = await Promise.all([
            fetch('https://api.gold-api.com/price/XAU'),
            fetch('https://api.frankfurter.app/latest?from=USD&to=INR')
          ])
          if (xauRes.ok && forexRes.ok) {
            const xauData = await xauRes.json()
            const forexData = await forexRes.json()
            const xauUsd = Number(xauData.price)
            const usdToInr = Number(forexData.rates?.INR) || 86.5
            if (xauUsd && usdToInr) {
              const spotPerGram = (xauUsd * usdToInr) / 31.1034768
              pricePerGram = Math.round(spotPerGram * 1.10)
            }
          }
        } catch {
          // Both failed
        }
      }

      // 3. Fallback baseline if entirely offline
      if (!pricePerGram) {
        pricePerGram = 15280
        isReferencePrice = true
      }

      const snapshot: GoldPriceSnapshot = {
        pricePerGram24K: pricePerGram,
        pricePer10Gram24K: pricePerGram * 10,
        currency: '₹',
        dailyChangePct: 0.35,
        timestamp: Date.now(),
        isReferencePrice
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(GOLD_CACHE_KEY, JSON.stringify(snapshot))
      }

      return snapshot
    } catch (err) {
      console.warn('[GoldPriceService] Failed to load gold price, using stale cache if available:', err)
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(GOLD_CACHE_KEY)
          if (raw) return JSON.parse(raw)
        } catch {}
      }
      return null
    }
  }
}
