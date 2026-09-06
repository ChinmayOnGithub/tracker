"use client"

/**
 * CompactTodayPills
 * Compact status indicators displayed in the Today header, showing live weather
 * conditions and temperature fetched non-blockingly from the WeatherService.
 */

import React, { useEffect, useState } from 'react'
import { WeatherService, WeatherSnapshot } from '@/lib/services/WeatherService'

export const CompactTodayPills: React.FC = () => {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => WeatherService.getCachedSnapshot())

  useEffect(() => {
    // Background non-blocking weather fetch
    WeatherService.fetchWeather().then(res => {
      if (res) setWeather(res)
    })
  }, [])

  if (!weather) return null

  return (
    <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--color-text-muted)] select-none">
      <span
        className="inline-flex items-center gap-1 hover:text-[var(--color-text-main)] transition-colors cursor-default"
        title={`Weather: ${weather.tempC}°C, ${weather.description}`}
      >
        <span>{weather.icon}</span>
        <span>{weather.tempC}°C · {weather.description}</span>
      </span>
    </div>
  )
}
