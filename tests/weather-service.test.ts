/**
 * WeatherService & Hourly Forecast Unit Tests
 * 
 * Verifies:
 * - WMO weather code mapping (day/night, rain, storm, snow, fog)
 * - Hourly forecast data normalization
 * - Missing optional fields handling
 * - Timezone retention & local hour calculation
 * - In-flight request deduplication
 * - Multi-tier caching and stale-while-revalidate behavior
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { WeatherService, interpretWeatherCode, WeatherForecastData } from '@/lib/services/WeatherService'
import { requestDeduplicator } from '@/lib/store/requestDeduplicator'

describe('WeatherService Domain & Hourly Normalization', () => {
  beforeEach(() => {
    requestDeduplicator.clear()
    // Reset global fetch mock if any
    global.fetch = mock() as unknown as typeof fetch
    // Reset localStorage mock
    const store: Record<string, string> = {}
    const mockStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
      length: 0,
      key: () => null,
    }
    global.localStorage = mockStorage
    ;(global as unknown as { window: { localStorage: typeof mockStorage } }).window = {
      localStorage: mockStorage,
    }
  })



  describe('interpretWeatherCode', () => {
    it('maps code 0 to Clear sky with day and night icon variants', () => {
      const day = interpretWeatherCode(0, true)
      const night = interpretWeatherCode(0, false)
      expect(day.description).toBe('Clear sky')
      expect(day.icon).toBe('☀️')
      expect(night.icon).toBe('🌙')
    })

    it('maps rain, thunderstorm, snow, and fog accurately', () => {
      expect(interpretWeatherCode(61, true).description).toBe('Slight rain')
      expect(interpretWeatherCode(65, true).description).toBe('Heavy rain')
      expect(interpretWeatherCode(71, true).description).toBe('Slight snow fall')
      expect(interpretWeatherCode(95, true).description).toBe('Thunderstorm')
      expect(interpretWeatherCode(45, true).description).toBe('Fog')
    })

    it('falls back gracefully to Fair on unknown code', () => {
      const fallback = interpretWeatherCode(999, true)
      expect(fallback.description).toBe('Fair')
      expect(fallback.icon).toBe('🌤️')
    })
  })

  describe('formatHourLabel', () => {
    it('formats 12-hour labels accurately', () => {
      expect(WeatherService.formatHourLabel(0)).toBe('12 AM')
      expect(WeatherService.formatHourLabel(3)).toBe('3 AM')
      expect(WeatherService.formatHourLabel(12)).toBe('12 PM')
      expect(WeatherService.formatHourLabel(15)).toBe('3 PM')
      expect(WeatherService.formatHourLabel(23)).toBe('11 PM')
    })
  })

  describe('fetchForecast Normalization & Timezone Handling', () => {
    it('normalizes current and hourly data while preserving location timezone', async () => {
      const mockResponse = {
        timezone: 'Asia/Kolkata',
        current: {
          temperature_2m: 28.6,
          apparent_temperature: 30.2,
          relative_humidity_2m: 65,
          weather_code: 2,
          is_day: 1,
          wind_speed_10m: 14.2,
        },
        hourly: {
          time: [
            '2026-09-06T14:00',
            '2026-09-06T15:00',
            '2026-09-06T16:00',
          ],
          temperature_2m: [29.1, 28.5, 27.8],
          apparent_temperature: [31.0, 30.2, 29.5],
          precipitation_probability: [0, 25, 60],
          weather_code: [1, 2, 61],
          wind_speed_10m: [12.0, 15.0, 18.0],
          relative_humidity_2m: [60, 65, 75],
          is_day: [1, 1, 1],
        },
      }

      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        } as Response)
      ) as unknown as typeof fetch

      const result = await WeatherService.fetchForecast(18.5597, 73.7868, 'Pune', 'celsius')

      expect(result).not.toBeNull()
      expect(result?.locationName).toBe('Pune')
      expect(result?.timezone).toBe('Asia/Kolkata')
      expect(result?.current.temperature).toBe(29) // Rounded
      expect(result?.current.apparentTemperature).toBe(30)
      expect(result?.current.humidity).toBe(65)
      expect(result?.current.windSpeed).toBe(14)

      expect(result?.hourly.length).toBe(3)
      expect(result?.hourly[0].hour).toBe(14)
      expect(result?.hourly[0].hourLabel).toBe('2 PM')
      expect(result?.hourly[0].temperature).toBe(29)
      expect(result?.hourly[0].precipitationProbability).toBe(0)

      expect(result?.hourly[2].hour).toBe(16)
      expect(result?.hourly[2].hourLabel).toBe('4 PM')
      expect(result?.hourly[2].precipitationProbability).toBe(60)
      expect(result?.hourly[2].description).toBe('Slight rain')
    })

    it('handles missing optional fields in hourly data without throwing', async () => {
      const partialResponse = {
        timezone: 'America/New_York',
        current: {
          temperature_2m: 20.0,
          is_day: 0,
          weather_code: 0,
        },
        hourly: {
          time: ['2026-09-06T00:00'],
          temperature_2m: [20.0],
          weather_code: [0],
          is_day: [0],
        },
      }

      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(partialResponse),
        } as Response)
      ) as unknown as typeof fetch

      const result = await WeatherService.fetchForecast(40.7128, -74.0060, 'New York', 'celsius')
      expect(result).not.toBeNull()
      expect(result?.hourly[0].hour).toBe(0)
      expect(result?.hourly[0].hourLabel).toBe('12 AM')
      expect(result?.hourly[0].apparentTemperature).toBeUndefined()
      expect(result?.hourly[0].precipitationProbability).toBeUndefined()
    })
  })

  describe('Caching & Stale-While-Revalidate', () => {
    it('returns fresh cached forecast immediately without calling network', async () => {
      const cachedData: WeatherForecastData = {
        locationName: 'Cached Pune',
        timezone: 'Asia/Kolkata',
        current: {
          temperature: 25,
          weatherCode: 0,
          description: 'Clear sky',
          icon: '☀️',
          isDay: true,
          timestamp: Date.now(),
        },
        hourly: [],
        cachedAt: Date.now(),
      }

      const cacheKey = 'tracker_weather_forecast_v1_18.5597_73.7868_celsius'
      localStorage.setItem(cacheKey, JSON.stringify(cachedData))

      const fetchMock = mock(() => Promise.resolve({ ok: true } as Response))
      global.fetch = fetchMock as unknown as typeof fetch

      const res = await WeatherService.fetchForecast(18.5597, 73.7868, 'Pune', 'celsius')

      expect(res?.locationName).toBe('Cached Pune')
      expect(fetchMock.mock.calls.length).toBe(0)
    })

    it('falls back to stale cache on network failure rather than throwing or returning null', async () => {
      const staleData: WeatherForecastData = {
        locationName: 'Stale Pune',
        timezone: 'Asia/Kolkata',
        current: {
          temperature: 24,
          weatherCode: 1,
          description: 'Mainly clear',
          icon: '🌤️',
          isDay: true,
          timestamp: Date.now() - 3600 * 1000 * 5, // 5 hours old
        },
        hourly: [],
        cachedAt: Date.now() - 3600 * 1000 * 5,
      }

      const cacheKey = 'tracker_weather_forecast_v1_18.5597_73.7868_celsius'
      localStorage.setItem(cacheKey, JSON.stringify(staleData))

      // Network returns 500 error
      global.fetch = mock(() => Promise.resolve({ ok: false, status: 500 } as Response)) as unknown as typeof fetch

      const res = await WeatherService.fetchForecast(18.5597, 73.7868, 'Pune', 'celsius')
      expect(res).not.toBeNull()
      expect(res?.locationName).toBe('Stale Pune')
    })
  })

  describe('Request Deduplication', () => {
    it('coalesces multiple simultaneous forecast requests into one network invocation', async () => {
      let networkCalls = 0
      global.fetch = mock(() => {
        networkCalls++
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              timezone: 'Asia/Kolkata',
              current: { temperature_2m: 29, is_day: 1, weather_code: 0 },
              hourly: {
                time: ['2026-09-06T12:00'],
                temperature_2m: [29],
                weather_code: [0],
                is_day: [1],
              },
            }),
        } as Response)
      }) as unknown as typeof fetch


      const [res1, res2, res3] = await Promise.all([
        WeatherService.fetchForecast(18.5597, 73.7868, 'Pune', 'celsius'),
        WeatherService.fetchForecast(18.5597, 73.7868, 'Pune', 'celsius'),
        WeatherService.fetchForecast(18.5597, 73.7868, 'Pune', 'celsius'),
      ])

      expect(networkCalls).toBe(1)
      expect(res1?.current.temperature).toBe(29)
      expect(res2?.current.temperature).toBe(29)
      expect(res3?.current.temperature).toBe(29)
    })
  })
})
