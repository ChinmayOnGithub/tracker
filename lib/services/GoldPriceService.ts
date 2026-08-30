/**
 * GoldPriceService
 * 
 * Clean integration service for compact spot & market reference gold rates in INR/gram.
 * Uses 2-hour local caching and fallback estimates so Today never blocks or fails.
 */

export interface GoldPriceSnapshot {
  pricePerGram24K: number
  pricePer10Gram24K: number
  currency: string
  dailyChangePct?: number
  timestamp: number
  label: 'Spot / Reference' | 'Live Spot'
}

const GOLD_CACHE_KEY = 'tracker_gold_price_snapshot_v4'
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
   * Fetches latest 24K gold benchmark market rate in INR per 10 grams directly from real-time API.
   */
  static async fetchGoldPrice(): Promise<GoldPriceSnapshot | null> {
    try {
      const cached = this.getCachedSnapshot()
      if (cached) return cached

      let pricePerGram: number | null = null
      let dailyChange: number | undefined = undefined
      let label: 'Spot / Reference' | 'Live Spot' = 'Spot / Reference'

      // 1. Primary Live Feed: Real-time XAU/INR Spot API
      try {
        const liveRes = await fetch('https://api.gold-api.com/price/XAU/INR')
        if (liveRes.ok) {
          const liveData = await liveRes.json()
          const xauInr = Number(liveData.price)
          if (xauInr && xauInr > 50000) {
            // 1 troy ounce = 31.1034768 grams.
            // Pure live spot price in INR per gram:
            const spotPerGram = Math.round(xauInr / 31.1034768)
            pricePerGram = spotPerGram
            label = 'Live Spot'

            if (typeof liveData.chp === 'number') {
              dailyChange = Math.round(liveData.chp * 100) / 100
            }
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
              const spotPerGram = Math.round((xauUsd * usdToInr) / 31.1034768)
              pricePerGram = spotPerGram
              label = 'Live Spot'
              if (typeof xauData.chp === 'number') {
                dailyChange = Math.round(xauData.chp * 100) / 100
              }
            }
          }
        } catch {
          // Both failed
        }
      }

      // 3. Fallback benchmark if entirely offline
      if (!pricePerGram) {
        pricePerGram = 8200 // Realistic spot benchmark ~₹82,000/10g
        label = 'Spot / Reference'
      }

      const snapshot: GoldPriceSnapshot = {
        pricePerGram24K: pricePerGram,
        pricePer10Gram24K: pricePerGram * 10,
        currency: '₹',
        dailyChangePct: dailyChange, // Only include if provided by genuine source
        timestamp: Date.now(),
        label
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
