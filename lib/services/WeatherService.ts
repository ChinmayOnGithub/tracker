/**
 * WeatherService
 * 
 * Clean integration service for compact weather snapshots via Open-Meteo.
 * Open, free, no API key required, with local caching in localStorage / IndexedDB.
 */

export interface WeatherSnapshot {
  tempC: number
  weatherCode: number
  description: string
  icon: string
  isDay: boolean
  timestamp: number
}

const WEATHER_CACHE_KEY = 'tracker_weather_snapshot_v2'
const WEATHER_CACHE_TTL = 60 * 60 * 1000 // 1 hour

// WMO Weather interpretation codes (WW)
function interpretWeatherCode(code: number, isDay = true): { description: string; icon: string } {
  switch (code) {
    case 0:
      return { description: 'Clear', icon: isDay ? '☀' : '🌙' }
    case 1:
    case 2:
      return { description: 'Partly Cloudy', icon: isDay ? '⛅' : '☁' }
    case 3:
      return { description: 'Overcast', icon: '☁' }
    case 45:
    case 48:
      return { description: 'Fog', icon: '🌫' }
    case 51:
    case 53:
    case 55:
      return { description: 'Drizzle', icon: '🌦' }
    case 61:
    case 63:
    case 65:
      return { description: 'Rain', icon: '🌧' }
    case 71:
    case 73:
    case 75:
      return { description: 'Snow', icon: '❄' }
    case 80:
    case 81:
    case 82:
      return { description: 'Showers', icon: '🌦' }
    case 95:
    case 96:
    case 99:
      return { description: 'Thunderstorm', icon: '⛈' }
    default:
      return { description: 'Fair', icon: isDay ? '☀' : '🌙' }
  }
}

export class WeatherService {
  /**
   * Retrieves cached weather snapshot if valid.
   */
  static getCachedSnapshot(): WeatherSnapshot | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(WEATHER_CACHE_KEY)
      if (!raw) return null
      const parsed: WeatherSnapshot = JSON.parse(raw)
      if (Date.now() - parsed.timestamp < WEATHER_CACHE_TTL) {
        return parsed
      }
    } catch {
      // Ignore cache parse failure
    }
    return null
  }

  /**
   * Fetches the current weather snapshot using default or detected coordinates.
   * Defaults specifically to Baner, Pune (18.5597, 73.7868).
   * Caches result locally.
   */
  static async fetchWeather(lat = 18.5597, lon = 73.7868): Promise<WeatherSnapshot | null> {
    try {
      const cached = this.getCachedSnapshot()
      if (cached) return cached

      // Open-Meteo current weather endpoint
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,is_day,weather_code&timezone=auto`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Weather API error')
      
      const data = await res.json()
      const current = data.current
      if (!current) throw new Error('No current data')

      const isDay = current.is_day === 1
      const weatherCode = current.weather_code ?? 0
      const { description, icon } = interpretWeatherCode(weatherCode, isDay)

      const snapshot: WeatherSnapshot = {
        tempC: Math.round(current.temperature_2m),
        weatherCode,
        description,
        icon,
        isDay,
        timestamp: Date.now()
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot))
      }

      return snapshot
    } catch (err) {
      console.warn('[WeatherService] Failed to load weather, falling back to cached:', err)
      // Return stale cache if available
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(WEATHER_CACHE_KEY)
          if (raw) return JSON.parse(raw)
        } catch {}
      }
      return null
    }
  }
}
