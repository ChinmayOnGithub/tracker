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

export interface HourlyWeather {
  timestamp: string // ISO string
  time: number     // Unix timestamp ms
  localDate: string // e.g. "2026-09-06"
  localTimeStr: string // e.g. "4:00 PM"
  hourLabel: string // e.g. "4 PM"
  hour: number     // 0-23
  temperature: number
  apparentTemperature?: number
  precipitationProbability?: number
  weatherCode: number
  isDay: boolean
  windSpeed?: number
  humidity?: number
  description: string
  icon: string
}


export interface WeatherForecastData {
  locationName: string
  timezone: string
  current: {
    temperature: number
    apparentTemperature?: number
    humidity?: number
    windSpeed?: number
    weatherCode: number
    description: string
    icon: string
    isDay: boolean
    timestamp: number
  }
  hourly: HourlyWeather[]
  cachedAt: number
}

const WEATHER_CACHE_KEY = 'tracker_weather_snapshot_v2'
const WEATHER_FORECAST_CACHE_KEY = 'tracker_weather_forecast_v2'
const WEATHER_CACHE_TTL = 60 * 60 * 1000 // 1 hour


// WMO Weather interpretation codes (WW)
export function interpretWeatherCode(code: number, isDay = true): { description: string; icon: string } {
  switch (code) {
    case 0:
      return { description: 'Clear sky', icon: isDay ? '☀️' : '🌙' }
    case 1:
      return { description: 'Mainly clear', icon: isDay ? '🌤️' : '🌙' }
    case 2:
      return { description: 'Partly cloudy', icon: isDay ? '⛅' : '☁️' }
    case 3:
      return { description: 'Overcast', icon: '☁️' }
    case 45:
      return { description: 'Fog', icon: '🌫️' }
    case 48:
      return { description: 'Depositing rime fog', icon: '🌫️' }
    case 51:
      return { description: 'Light drizzle', icon: '🌦️' }
    case 53:
      return { description: 'Moderate drizzle', icon: '🌦️' }
    case 55:
      return { description: 'Dense drizzle', icon: '🌧️' }
    case 56:
    case 57:
      return { description: 'Freezing drizzle', icon: '🌨️' }
    case 61:
      return { description: 'Slight rain', icon: '🌦️' }
    case 63:
      return { description: 'Moderate rain', icon: '🌧️' }
    case 65:
      return { description: 'Heavy rain', icon: '🌧️' }
    case 66:
    case 67:
      return { description: 'Freezing rain', icon: '🌨️' }
    case 71:
      return { description: 'Slight snow fall', icon: '🌨️' }
    case 73:
      return { description: 'Moderate snow fall', icon: '❄️' }
    case 75:
      return { description: 'Heavy snow fall', icon: '❄️' }
    case 77:
      return { description: 'Snow grains', icon: '❄️' }
    case 80:
      return { description: 'Slight rain showers', icon: '🌦️' }
    case 81:
      return { description: 'Moderate rain showers', icon: '🌧️' }
    case 82:
      return { description: 'Violent rain showers', icon: '⛈️' }
    case 85:
      return { description: 'Slight snow showers', icon: '🌨️' }
    case 86:
      return { description: 'Heavy snow showers', icon: '❄️' }
    case 95:
      return { description: 'Thunderstorm', icon: '⛈️' }
    case 96:
    case 99:
      return { description: 'Thunderstorm with hail', icon: '⛈️' }
    default:
      return { description: 'Fair', icon: isDay ? '🌤️' : '🌙' }
  }
}

export class WeatherService {
  /**
   * Formats an hour index into a concise label like "3 PM" or "12 AM".
   */
  static formatHourLabel(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 === 0 ? 12 : hour % 12
    return `${displayHour} ${period}`
  }

  /**
   * Returns the hourly forecast entries specifically for the given displayedDate (YYYY-MM-DD).
   * Filters by localDate strictly without timezone drift or falling back to other dates.
   */
  static getForecastForDate(forecast: WeatherForecastData | null, targetDateStr: string): HourlyWeather[] {
    if (!forecast || !forecast.hourly || !Array.isArray(forecast.hourly)) return []
    return forecast.hourly.filter(h => h.localDate === targetDateStr)
  }


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
   * Generates standard cache key for forecast based on location and unit.
   */
  static getForecastCacheKey(
    lat = 18.5597,
    lon = 73.7868,
    temperatureUnit: 'celsius' | 'fahrenheit' = 'celsius'
  ): string {
    return `${WEATHER_FORECAST_CACHE_KEY}_${lat}_${lon}_${temperatureUnit}`
  }

  /**
   * Retrieves cached weather forecast if valid.
   */
  static getCachedForecast(key = WEATHER_FORECAST_CACHE_KEY): WeatherForecastData | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed: WeatherForecastData = JSON.parse(raw)
      // Check if cache is fresh and has localDate on hourly items
      if (
        Date.now() - parsed.cachedAt < WEATHER_CACHE_TTL &&
        Array.isArray(parsed.hourly) &&
        (parsed.hourly.length === 0 || !!parsed.hourly[0].localDate)
      ) {
        return parsed
      }
    } catch {
      // Ignore cache parse failure
    }
    return null
  }


  /**
   * Fetches the current weather snapshot using default or detected coordinates.
   * Defaults to Pune (18.5597, 73.7868).
   * Maintained for backward compatibility with CompactTodayPills.
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

  /**
   * Fetches the complete, normalized forecast for the Today Hourly Weather Widget.
   * Uses Open-Meteo with current + hourly variables in a single scoped request.
   * Integrates in-flight request deduplication and local persistence.
   */
  static async fetchForecast(
    lat = 18.5597,
    lon = 73.7868,
    locationName = 'Pune',
    temperatureUnit: 'celsius' | 'fahrenheit' = 'celsius'
  ): Promise<WeatherForecastData | null> {
    const cacheKey = `${WEATHER_FORECAST_CACHE_KEY}_${lat}_${lon}_${temperatureUnit}`

    // 1. Check in-memory/localStorage cache
    const cached = this.getCachedForecast(cacheKey)
    if (cached) {
      return cached
    }

    // 2. Request deduplication
    const dedupeKey = `forecast_${lat}_${lon}_${temperatureUnit}`
    const { requestDeduplicator } = await import('@/lib/store/requestDeduplicator')

    return requestDeduplicator.dedupe(dedupeKey, async () => {
      try {
        const tempParam = temperatureUnit === 'fahrenheit' ? '&temperature_unit=fahrenheit' : ''
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,relative_humidity_2m,is_day&timezone=auto&forecast_days=7${tempParam}`

        const res = await fetch(url)

        if (!res.ok) throw new Error(`Weather API error: ${res.status}`)

        const data = await res.json()
        const currentData = data.current
        const hourlyData = data.hourly
        const resolvedTimezone = data.timezone || 'UTC'

        if (!currentData || !hourlyData) {
          throw new Error('Incomplete weather forecast payload')
        }

        const isCurrentDay = currentData.is_day === 1
        const currentCode = currentData.weather_code ?? 0
        const { description: currentDesc, icon: currentIcon } = interpretWeatherCode(currentCode, isCurrentDay)

        // Normalize hourly items
        const hourlyList: HourlyWeather[] = []
        const times = (hourlyData.time as string[]) || []
        const temps = (hourlyData.temperature_2m as number[]) || []
        const apparentTemps = (hourlyData.apparent_temperature as number[]) || []
        const precips = (hourlyData.precipitation_probability as number[]) || []
        const codes = (hourlyData.weather_code as number[]) || []
        const winds = (hourlyData.wind_speed_10m as number[]) || []
        const humidities = (hourlyData.relative_humidity_2m as number[]) || []
        const isDays = (hourlyData.is_day as number[]) || []

        for (let i = 0; i < times.length; i++) {
          const timeIso = times[i] // e.g. "2026-09-06T14:00"
          const isItemDay = isDays[i] === 1
          const code = codes[i] ?? 0
          const { description, icon } = interpretWeatherCode(code, isItemDay)

          // Parse localDate and hour directly from ISO format ("YYYY-MM-DDTHH:MM") to preserve weather location's local calendar
          const [datePart, hourPartRaw] = timeIso.split('T')
          const hourPart = hourPartRaw || '00:00'
          const hourNum = parseInt(hourPart.split(':')[0], 10) || 0

          hourlyList.push({
            timestamp: timeIso,
            time: new Date(timeIso).getTime(),
            localDate: datePart,
            localTimeStr: `${hourNum % 12 === 0 ? 12 : hourNum % 12}:${hourPart.split(':')[1] || '00'} ${hourNum >= 12 ? 'PM' : 'AM'}`,
            hourLabel: WeatherService.formatHourLabel(hourNum),
            hour: hourNum,
            temperature: Math.round(temps[i] ?? 0),
            apparentTemperature: apparentTemps[i] !== undefined ? Math.round(apparentTemps[i]) : undefined,
            precipitationProbability: precips[i] !== undefined ? Math.round(precips[i]) : undefined,
            weatherCode: code,
            isDay: isItemDay,
            windSpeed: winds[i] !== undefined ? Math.round(winds[i]) : undefined,
            humidity: humidities[i] !== undefined ? Math.round(humidities[i]) : undefined,
            description,
            icon
          })
        }


        const normalizedForecast: WeatherForecastData = {
          locationName,
          timezone: resolvedTimezone,
          current: {
            temperature: Math.round(currentData.temperature_2m),
            apparentTemperature: currentData.apparent_temperature !== undefined ? Math.round(currentData.apparent_temperature) : undefined,
            humidity: currentData.relative_humidity_2m !== undefined ? Math.round(currentData.relative_humidity_2m) : undefined,
            windSpeed: currentData.wind_speed_10m !== undefined ? Math.round(currentData.wind_speed_10m) : undefined,
            weatherCode: currentCode,
            description: currentDesc,
            icon: currentIcon,
            isDay: isCurrentDay,
            timestamp: Date.now()
          },
          hourly: hourlyList,
          cachedAt: Date.now()
        }

        // Save to cache
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(cacheKey, JSON.stringify(normalizedForecast))
            // Also update legacy snapshot for CompactTodayPills
            const legacySnapshot: WeatherSnapshot = {
              tempC: normalizedForecast.current.temperature,
              weatherCode: normalizedForecast.current.weatherCode,
              description: normalizedForecast.current.description,
              icon: normalizedForecast.current.icon,
              isDay: normalizedForecast.current.isDay,
              timestamp: normalizedForecast.cachedAt
            }
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(legacySnapshot))
          } catch {}
        }

        return normalizedForecast
      } catch (err) {
        console.warn('[WeatherService] Failed to load forecast, checking stale cache:', err)
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem(cacheKey)
            if (raw) return JSON.parse(raw)
          } catch {}
        }
        return null
      }
    })
  }
}

