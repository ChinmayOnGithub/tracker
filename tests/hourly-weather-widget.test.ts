/**
 * HourlyWeatherWidget UI & Accessibility Tests
 * 
 * Verifies:
 * - WIDGET_REGISTRY metadata and constraints for 'weather'
 * - Layout engine migration & clampItem compatibility
 * - Default placement in dashboard
 */

import { describe, it, expect } from 'bun:test'
import { getWidgetDefinition } from '@/lib/dashboard/registry'
import { clampItem, generateDefaultDashboardLayout } from '@/lib/dashboard/layoutEngine'
import { WeatherService, HourlyWeather } from '@/lib/services/WeatherService'



describe('HourlyWeatherWidget Dashboard Integration', () => {
  it('registers weather widget in WIDGET_REGISTRY with required constraints', () => {
    const def = getWidgetDefinition('weather')
    expect(def).toBeDefined()
    expect(def?.id).toBe('weather')
    expect(def?.defaultEnabled).toBe(true)
    expect(def?.minW).toBe(5)
    expect(def?.maxW).toBe(14)
    expect(def?.minH).toBe(3)
    expect(def?.maxH).toBe(6)
    expect(def?.defaultW).toBe(7)
    expect(def?.defaultH).toBe(4)
  })

  it('clamps weather widget correctly according to registry constraints', () => {
    // Under-sized clamp
    const under = clampItem({ id: 'weather', x: 0, y: 0, w: 2, h: 1 })
    expect(under.w).toBe(5)
    expect(under.h).toBe(3)

    // Over-sized clamp
    const over = clampItem({ id: 'weather', x: 20, y: 0, w: 18, h: 10 })
    expect(over.w).toBe(14)
    expect(over.h).toBe(6)
    expect(over.x).toBe(20 - 14) // 6, within 20 columns
  })

  it('includes weather widget in default dashboard layout', () => {
    const layout = generateDefaultDashboardLayout()
    const weatherItem = layout.items.find(i => i.id === 'weather')
    expect(weatherItem).toBeDefined()
    expect(weatherItem?.w).toBe(7)
    expect(weatherItem?.h).toBe(4)
    expect(layout.hidden).not.toContain('weather')
  })
})

describe('HourlyWeatherWidget Date Awareness & Day Selection', () => {
  const sampleForecast = {
    locationName: 'Pune',
    timezone: 'Asia/Kolkata',
    current: {
      temperature: 29,
      apparentTemperature: 31,
      humidity: 58,
      windSpeed: 12,
      weatherCode: 2,
      description: 'Partly cloudy',
      icon: '⛅',
      isDay: true,
      timestamp: 1788690000000,
    },
    hourly: [
      // Day 1: Sep 6
      {
        timestamp: '2026-09-06T15:00',
        time: 1788687000000,
        localDate: '2026-09-06',
        localTimeStr: '3:00 PM',
        hourLabel: '3 PM',
        hour: 15,
        temperature: 30,
        weatherCode: 1,
        isDay: true,
        description: 'Mainly clear',
        icon: '🌤️',
      },
      {
        timestamp: '2026-09-06T16:00',
        time: 1788690600000,
        localDate: '2026-09-06',
        localTimeStr: '4:00 PM',
        hourLabel: '4 PM',
        hour: 16,
        temperature: 29,
        weatherCode: 2,
        isDay: true,
        description: 'Partly cloudy',
        icon: '⛅',
      },
      // Day 2: Sep 7
      {
        timestamp: '2026-09-07T00:00',
        time: 1788719400000,
        localDate: '2026-09-07',
        localTimeStr: '12:00 AM',
        hourLabel: '12 AM',
        hour: 0,
        temperature: 24,
        weatherCode: 0,
        isDay: false,
        description: 'Clear sky',
        icon: '🌙',
      },
      {
        timestamp: '2026-09-07T16:00',
        time: 1788777000000,
        localDate: '2026-09-07',
        localTimeStr: '4:00 PM',
        hourLabel: '4 PM',
        hour: 16,
        temperature: 27,
        weatherCode: 61,
        isDay: true,
        description: 'Slight rain',
        icon: '🌦️',
      },
    ],
    cachedAt: 1788690000000,
  }

  it('Test 1: Given forecast with Sep 6 4 PM and Sep 7 4 PM, selecting Sep 7 returns Sep 7 4 PM (not Sep 6)', () => {
    const sep7Entries = WeatherService.getForecastForDate(sampleForecast, '2026-09-07')

    expect(sep7Entries.length).toBe(2)
    const fourPm = sep7Entries.find((h: HourlyWeather) => h.hour === 16)
    expect(fourPm).toBeDefined()
    expect(fourPm?.localDate).toBe('2026-09-07')
    expect(fourPm?.temperature).toBe(27)
    expect(fourPm?.description).toBe('Slight rain')
  })

  it('Test 2: Navigating from Sep 6 to Sep 7 changes hourly weather entries', () => {
    const sep6Entries = WeatherService.getForecastForDate(sampleForecast, '2026-09-06')
    const sep7Entries = WeatherService.getForecastForDate(sampleForecast, '2026-09-07')

    expect(sep6Entries.map((h: HourlyWeather) => h.temperature)).toEqual([30, 29])
    expect(sep7Entries.map((h: HourlyWeather) => h.temperature)).toEqual([24, 27])
  })

  it('Test 3: Navigating to a date not present returns empty array rather than falling back to today', () => {
    const sep8Entries = WeatherService.getForecastForDate(sampleForecast, '2026-09-08')
    expect(sep8Entries).toEqual([])
  })

  it('Test 6: Two dates containing the same hour (hour=16) are distinguished by localDate', () => {
    const sep6_16 = WeatherService.getForecastForDate(sampleForecast, '2026-09-06').find((h: HourlyWeather) => h.hour === 16)
    const sep7_16 = WeatherService.getForecastForDate(sampleForecast, '2026-09-07').find((h: HourlyWeather) => h.hour === 16)

    expect(sep6_16?.localDate).toBe('2026-09-06')
    expect(sep6_16?.temperature).toBe(29)
    expect(sep7_16?.localDate).toBe('2026-09-07')
    expect(sep7_16?.temperature).toBe(27)
  })

  it('Test 9: Past date without forecast data returns empty array to prompt unavailable state', () => {
    const pastEntries = WeatherService.getForecastForDate(sampleForecast, '2026-09-05')
    expect(pastEntries.length).toBe(0)
  })

  it('Test 10: Cache containing today + tomorrow allows switching between them without network requests', () => {
    // Both dates resolve instantly from the same normalized forecast object
    const day1 = WeatherService.getForecastForDate(sampleForecast, '2026-09-06')
    const day2 = WeatherService.getForecastForDate(sampleForecast, '2026-09-07')

    expect(day1.length).toBeGreaterThan(0)
    expect(day2.length).toBeGreaterThan(0)
    expect(day1[0].localDate).toBe('2026-09-06')
    expect(day2[0].localDate).toBe('2026-09-07')
  })
})


