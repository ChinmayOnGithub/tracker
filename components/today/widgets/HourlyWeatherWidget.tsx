"use client"
/**
 * HourlyWeatherWidget
 * Production-grade Today Hourly Weather Widget modeled after Google Weather.
 * Features:
 * - Current weather condition header (temperature, condition, city, live minute-updating local time, secondary metrics)
 * - Horizontally scrollable 24-48h hourly strip
 * - Subtle current-hour spotlight with "NOW" badge
 * - Auto-centers current hour once on initial mount without fighting manual scrolling
 * - Multi-tier caching with background stale-while-revalidate
 * - Accessible keyboard navigation & responsive design
 */

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { CloudRain, Wind, Droplets, RefreshCw } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/design-system'
import { WeatherService, WeatherForecastData, HourlyWeather } from '@/lib/services/WeatherService'

interface HourlyWeatherWidgetProps {
  gridW?: number
  gridH?: number
  locationName?: string
  lat?: number
  lon?: number
  className?: string
}

export const HourlyWeatherWidget: React.FC<HourlyWeatherWidgetProps> = ({
  gridW: _gridW = 7,
  gridH = 4,
  locationName = 'Pune',
  lat = 18.5597,
  lon = 73.7868,
  className = '',
}) => {
  const [forecast, setForecast] = useState<WeatherForecastData | null>(() => {
    return WeatherService.getCachedForecast(`tracker_weather_forecast_v1_${lat}_${lon}_celsius`)
  })
  const [loading, setLoading] = useState<boolean>(!forecast)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date())
  const [hasScrolledToNow, setHasScrolledToNow] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const currentHourItemRef = useRef<HTMLDivElement>(null)

  // 1. Minute-level local clock timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  // 2. Fetch / Background revalidate forecast
  useEffect(() => {
    let isMounted = true
    WeatherService.fetchForecast(lat, lon, locationName, 'celsius')
      .then(data => {
        if (!isMounted) return
        if (data) {
          setForecast(data)
          setError(null)
        } else if (!forecast) {
          setError('Weather unavailable')
        }
      })
      .catch(() => {
        if (!isMounted) return
        if (!forecast) {
          setError('Failed to fetch weather')
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [lat, lon, locationName, forecast])

  const handleManualRefresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await WeatherService.fetchForecast(lat, lon, locationName, 'celsius')
      if (data) {
        setForecast(data)
      } else if (!forecast) {
        setError('Weather unavailable')
      }
    } catch {
      if (!forecast) {
        setError('Failed to fetch weather')
      }
    } finally {
      setLoading(false)
    }
  }, [lat, lon, locationName, forecast])


  // 3. Current local time formatted in the location's timezone
  const formattedCurrentTime = useMemo(() => {
    const tz = forecast?.timezone || 'auto'
    try {
      const options: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...(tz !== 'auto' ? { timeZone: tz } : {}),
      }
      const timePart = new Intl.DateTimeFormat('en-US', options).format(currentTime)
      return `Today · ${timePart}`
    } catch {
      return `Today · ${currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    }
  }, [currentTime, forecast?.timezone])

  // 4. Current hour index in location's timezone
  const currentHourInLocation = useMemo(() => {
    const tz = forecast?.timezone || 'auto'
    try {
      const hourStr = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        ...(tz !== 'auto' ? { timeZone: tz } : {}),
      }).format(currentTime)
      return parseInt(hourStr, 10)
    } catch {
      return currentTime.getHours()
    }
  }, [currentTime, forecast?.timezone])

  // 5. Derive the hourly list starting around now and the next 24 hours
  const filteredHours = useMemo(() => {
    if (!forecast || !forecast.hourly || forecast.hourly.length === 0) return []
    // Find the first occurrence of the current hour on today
    // We display current hour + up to 24 following hours
    const nowIdx = forecast.hourly.findIndex(h => h.hour === currentHourInLocation)
    if (nowIdx !== -1) {
      // Include a couple of prior hours if available for context, or start at now
      const start = Math.max(0, nowIdx - 1)
      return forecast.hourly.slice(start, start + 24)
    }
    return forecast.hourly.slice(0, 24)
  }, [forecast, currentHourInLocation])

  // 6. Smooth native centering around NOW on initial load
  useEffect(() => {
    if (!hasScrolledToNow && currentHourItemRef.current && scrollContainerRef.current) {
      currentHourItemRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      })
      setHasScrolledToNow(true)
    }
  }, [hasScrolledToNow, filteredHours])

  const isCompactHeight = gridH <= 3

  // Fallback / Loading state (only shown if NO cached forecast exists)
  if (loading && !forecast) {
    return (
      <Card className={`p-4 flex flex-col justify-between select-none ${className}`}>
        <CardHeader className="p-0 border-none flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl animate-pulse">🌤️</span>
            <div>
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">Weather</span>
              <p className="text-[10px] text-[var(--color-text-muted)]/70">Loading forecast…</p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0 flex items-center justify-center py-4">
          <div className="h-12 w-full bg-[var(--color-bg-muted)]/40 rounded-lg animate-pulse" />
        </CardBody>
      </Card>
    )
  }

  // Error state (only if no cached data exists)
  if (error && !forecast) {
    return (
      <Card className={`p-4 flex flex-col justify-between select-none ${className}`}>
        <CardHeader className="p-0 border-none flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">Weather</span>
          <span className="text-xs text-[var(--color-text-muted)]">{locationName}</span>
        </CardHeader>
        <CardBody className="p-0 py-3 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">{error}</p>
          <button
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>

        </CardBody>
      </Card>
    )
  }

  if (!forecast) return null

  const current = forecast.current

  return (
    <Card className={`flex flex-col justify-between select-none p-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200 ${className}`}>
      {/* Header Condition Area */}
      <CardHeader className="p-0 border-none mb-2">
        <div className="flex items-start justify-between">
          {/* Main Temperature & Condition */}
          <div className="flex items-center gap-2.5">
            <span className="text-3xl leading-none" role="img" aria-label={current.description}>
              {current.icon}
            </span>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">
                  {current.temperature}°
                </span>
                <span className="text-xs font-medium text-[var(--color-text-muted)]">
                  {current.description}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-text-main)]">{forecast.locationName}</span>
                <span>·</span>
                <span>{formattedCurrentTime}</span>
              </div>
            </div>
          </div>

          {/* Secondary conditions */}
          {!isCompactHeight && (
            <div className="flex flex-col items-end text-[11px] text-[var(--color-text-muted)] space-y-0.5">
              {current.apparentTemperature !== undefined && (
                <span>Feels {current.apparentTemperature}°</span>
              )}
              <div className="flex items-center gap-2 text-[10px]">
                {current.humidity !== undefined && (
                  <span className="inline-flex items-center gap-0.5" title={`Humidity: ${current.humidity}%`}>
                    <Droplets className="w-3 h-3 text-sky-500" />
                    {current.humidity}%
                  </span>
                )}
                {current.windSpeed !== undefined && (
                  <span className="inline-flex items-center gap-0.5" title={`Wind Speed: ${current.windSpeed} km/h`}>
                    <Wind className="w-3 h-3 text-teal-500" />
                    {current.windSpeed} km/h
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      {/* Horizontally Scrollable Hourly Strip */}
      <CardBody className="p-0 overflow-hidden">
        <div
          ref={scrollContainerRef}
          role="region"
          aria-label="Hourly weather forecast"
          tabIndex={0}
          className="flex items-center gap-1.5 overflow-x-auto py-1.5 scrollbar-none no-scrollbar focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)] rounded-lg"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {filteredHours.map((hourItem: HourlyWeather, index: number) => {
            const isNow = hourItem.hour === currentHourInLocation && index <= 1
            const hasPrecipitation = (hourItem.precipitationProbability ?? 0) > 0

            return (
              <div
                key={hourItem.timestamp}
                ref={isNow ? currentHourItemRef : undefined}
                tabIndex={0}
                role="group"
                aria-label={`${isNow ? 'Now, ' : ''}${hourItem.hourLabel}, ${hourItem.description}, ${hourItem.temperature} degrees${hasPrecipitation ? `, ${hourItem.precipitationProbability} percent chance of rain` : ''}`}
                className={`flex-shrink-0 flex flex-col items-center justify-between py-1.5 px-2.5 rounded-[var(--radius-md)] min-w-[54px] transition-all duration-150 cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)] ${
                  isNow
                    ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/40 shadow-xs'
                    : 'hover:bg-[var(--color-bg-muted)]/50 border border-transparent'
                }`}
              >
                {/* Time Label */}
                <span
                  className={`text-[10px] tracking-tight ${
                    isNow
                      ? 'font-bold text-[var(--color-primary)]'
                      : 'font-medium text-[var(--color-text-muted)]'
                  }`}
                >
                  {isNow ? 'NOW' : hourItem.hourLabel}
                </span>

                {/* Weather Icon */}
                <span className="text-base my-0.5 select-none" role="img" aria-hidden="true">
                  {hourItem.icon}
                </span>

                {/* Temperature */}
                <span
                  className={`text-xs ${
                    isNow
                      ? 'font-bold text-[var(--color-text-main)]'
                      : 'font-semibold text-[var(--color-text-main)]'
                  }`}
                >
                  {hourItem.temperature}°
                </span>

                {/* Subtle Precipitation Probability */}
                <div className="h-3.5 flex items-center justify-center">
                  {hasPrecipitation ? (
                    <span className="inline-flex items-center text-[9px] font-medium text-sky-500 gap-0.5">
                      <CloudRain className="w-2.5 h-2.5" />
                      {hourItem.precipitationProbability}%
                    </span>
                  ) : (
                    <span className="text-[9px] opacity-0">0%</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}
