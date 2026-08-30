/**
 * CurrencyService
 * 
 * Shared currency exchange rate service using open European Central Bank (ECB) Frankfurter data.
 * Caches conversion rates locally by base/target currency pair with a 24-hour TTL.
 */

export interface ExchangeRateRecord {
  base: string
  target: string
  rate: number
  date: string
  timestamp: number
}

const CURRENCY_CACHE_PREFIX = 'tracker_fx_rate_'
const FX_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export class CurrencyService {
  /**
   * Retrieves cached exchange rate between base and target currency.
   */
  static getCachedRate(base: string, target = 'INR'): number | null {
    if (base.toUpperCase() === target.toUpperCase()) return 1
    if (typeof window === 'undefined') return null

    try {
      const cacheKey = `${CURRENCY_CACHE_PREFIX}${base.toUpperCase()}_${target.toUpperCase()}`
      const raw = localStorage.getItem(cacheKey)
      if (!raw) return null
      const parsed: ExchangeRateRecord = JSON.parse(raw)
      if (Date.now() - parsed.timestamp < FX_CACHE_TTL) {
        return parsed.rate
      }
    } catch {
      // Ignore cache failure
    }
    return null
  }

  /**
   * Fetches the latest exchange rate for a foreign currency to target (default INR).
   */
  static async getRate(base: string, target = 'INR'): Promise<number | null> {
    const baseCode = base.toUpperCase()
    const targetCode = target.toUpperCase()

    if (baseCode === targetCode) return 1

    const cached = this.getCachedRate(baseCode, targetCode)
    if (cached !== null) return cached

    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${baseCode}&to=${targetCode}`)
      if (!res.ok) throw new Error('Exchange rate API unavailable')
      
      const data = await res.json()
      const rate = data.rates?.[targetCode]
      if (typeof rate !== 'number') throw new Error('Target currency not in rate response')

      const record: ExchangeRateRecord = {
        base: baseCode,
        target: targetCode,
        rate,
        date: data.date || new Date().toISOString().split('T')[0],
        timestamp: Date.now()
      }

      if (typeof window !== 'undefined') {
        const cacheKey = `${CURRENCY_CACHE_PREFIX}${baseCode}_${targetCode}`
        localStorage.setItem(cacheKey, JSON.stringify(record))
      }

      return rate
    } catch (err) {
      console.warn(`[CurrencyService] Could not fetch exchange rate for ${baseCode}->${targetCode}:`, err)
      // Return stale rate if exists
      if (typeof window !== 'undefined') {
        try {
          const cacheKey = `${CURRENCY_CACHE_PREFIX}${baseCode}_${targetCode}`
          const raw = localStorage.getItem(cacheKey)
          if (raw) return JSON.parse(raw).rate
        } catch {}
      }
      return null
    }
  }

  /**
   * Formats a given amount with original currency, and optionally derives approximate base conversion.
   */
  static formatForeignWithDerived(
    amount: number | null | undefined,
    currencySymbol = '$',
    foreignCode = 'USD',
    baseCurrencySymbol = '₹'
  ): { original: string; converted: string | null } | null {
    if (amount == null || isNaN(amount)) return null

    const original = `${currencySymbol}${Number.isInteger(amount) ? amount.toLocaleString('en-US') : amount.toFixed(2)}`
    const rate = this.getCachedRate(foreignCode, 'INR')
    
    if (rate) {
      const convertedVal = Math.round(amount * rate)
      return {
        original,
        converted: `≈ ${baseCurrencySymbol}${convertedVal.toLocaleString('en-IN')}`
      }
    }

    return { original, converted: null }
  }
}
