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
  displayedDate?: string // YYYY-MM-DD
  gridW?: number
  gridH?: number
  locationName?: string
  lat?: number
  lon?: number
  className?: string
}

export const HourlyWeatherWidget: React.FC<HourlyWeatherWidgetProps> = ({
  displayedDate,
  gridW: _gridW = 7,
  gridH = 4,
  locationName = 'Pune',
  lat = 18.5597,
  lon = 73.7868,
  className = '',
}) => {
  const [forecast, setForecast] = useState<WeatherForecastData | null>(() => {
    return WeatherService.getCachedForecast(WeatherService.getForecastCacheKey(lat, lon, 'celsius'))
  })

  const [loading, setLoading] = useState<boolean>(!forecast)
  const [error, setError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date())
  const lastScrolledDateRef = useRef<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const currentHourItemRef = useRef<HTMLDivElement>(null)


  // 1. Minute-level local clock timer (for live clock and current hour tracking)
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
        } else {
          setForecast(prev => {
            if (!prev) setError('Weather unavailable')
            return prev
          })
        }
      })
      .catch(() => {
        if (!isMounted) return
        setForecast(prev => {
          if (!prev) setError('Failed to fetch weather')
          return prev
        })
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [lat, lon, locationName])

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

  // 3. Current local date & hour in weather location's timezone
  const { currentLocalDateStr, currentLocalHour } = useMemo(() => {
    const tz = forecast?.timezone || 'auto'
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz !== 'auto' ? tz : undefined,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(currentTime)

      const year = parts.find(p => p.type === 'year')?.value || '1970'
      const month = parts.find(p => p.type === 'month')?.value || '01'
      const day = parts.find(p => p.type === 'day')?.value || '01'
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)

      return {
        currentLocalDateStr: `${year}-${month}-${day}`,
        currentLocalHour: hour,
      }
    } catch {
      const year = currentTime.getFullYear()
      const month = String(currentTime.getMonth() + 1).padStart(2, '0')
      const day = String(currentTime.getDate()).padStart(2, '0')
      return {
        currentLocalDateStr: `${year}-${month}-${day}`,
        currentLocalHour: currentTime.getHours(),
      }
    }
  }, [currentTime, forecast?.timezone])

  // Effective displayed date (defaults to weather location's current local date)
  const targetDateStr = displayedDate || currentLocalDateStr
  const isViewingToday = targetDateStr === currentLocalDateStr

  // 4. Derive hourly entries for targetDateStr
  const dayHourlyEntries = useMemo(() => {
    const entries = WeatherService.getForecastForDate(forecast, targetDateStr)
    // Fallback: If viewing today (or matching the first available hourly date) and entries is empty
    // but forecast has hourly items, gracefully display the day's items
    if (entries.length === 0 && forecast?.hourly?.length) {
      if (isViewingToday) {
        return forecast.hourly.slice(0, 24)
      }
      // If targetDateStr matches the date portion of the first hourly entry
      const firstEntryDate = forecast.hourly[0]?.localDate || forecast.hourly[0]?.timestamp?.split('T')[0]
      if (firstEntryDate === targetDateStr) {
        return forecast.hourly.slice(0, 24)
      }
    }
    return entries
  }, [forecast, targetDateStr, isViewingToday])

  // 5. Header formatted date / time
  const headerDateLabel = useMemo(() => {
    const tz = forecast?.timezone || 'auto'

    if (isViewingToday) {
      try {
        const timePart = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          ...(tz !== 'auto' ? { timeZone: tz } : {}),
        }).format(currentTime)
        return `Today · ${timePart}`
      } catch {
        return `Today · ${currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      }
    }

    // Check if target is tomorrow relative to currentLocalDateStr
    const [tY, tM, tD] = targetDateStr.split('-').map(Number)
    const targetUtc = Date.UTC(tY, tM - 1, tD)
    const [cY, cM, cD] = currentLocalDateStr.split('-').map(Number)
    const currentUtc = Date.UTC(cY, cM - 1, cD)
    const diffDays = Math.round((targetUtc - currentUtc) / (1000 * 60 * 60 * 24))

    if (diffDays === 1) {
      // Format as "Tomorrow · Sep 7"
      try {
        const datePart = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(targetUtc))
        return `Tomorrow · ${datePart}`
      } catch {
        return 'Tomorrow'
      }
    }

    // Other dates: e.g. "Mon · Sep 8"
    try {
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(targetUtc))
    } catch {
      return targetDateStr
    }
  }, [isViewingToday, targetDateStr, currentLocalDateStr, currentTime, forecast?.timezone])

  // 6. Summary condition for the header (live condition if today; mid-day or first hour if future date)
  const headerCondition = useMemo(() => {
    if (!forecast) return null
    if (isViewingToday) {
      return forecast.current
    }
    if (dayHourlyEntries.length > 0) {
      // Pick mid-day hour (around 12-14) or fallback to first available
      const midHour = dayHourlyEntries.find(h => h.hour === 12) ||
        dayHourlyEntries.find(h => h.hour === 14) ||
        dayHourlyEntries[0]
      return {
        temperature: midHour.temperature,
        apparentTemperature: midHour.apparentTemperature,
        humidity: midHour.humidity,
        windSpeed: midHour.windSpeed,
        weatherCode: midHour.weatherCode,
        description: midHour.description,
        icon: midHour.icon,
        isDay: midHour.isDay,
        timestamp: midHour.time,
      }
    }
    return null
  }, [forecast, isViewingToday, dayHourlyEntries])

  // 7. Auto-scroll behavior: position once per targetDateStr without triggering re-renders
  useEffect(() => {
    if (lastScrolledDateRef.current === targetDateStr) return
    if (!scrollContainerRef.current) return

    if (isViewingToday && currentHourItemRef.current) {
      currentHourItemRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      })
      lastScrolledDateRef.current = targetDateStr
    } else if (!isViewingToday && dayHourlyEntries.length > 0) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' })
      lastScrolledDateRef.current = targetDateStr
    }
  }, [targetDateStr, isViewingToday, dayHourlyEntries])


  const isCompactHeight = gridH <= 3

  // Fallback / Loading state
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

  // Error state (only if no cached data exists at all)
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

  // If date is outside available forecast range (e.g. past dates or too far ahead)
  const isDateUnavailable = dayHourlyEntries.length === 0

  return (
    <Card className={`flex flex-col justify-between select-none p-3.5 hover:shadow-[var(--card-hover-shadow)] transition-all duration-200 ${className}`}>
      {/* Header Condition Area */}
      <CardHeader className="p-0 border-none mb-2">
        <div className="flex items-start justify-between">
          {/* Main Temperature & Condition */}
          <div className="flex items-center gap-2.5">
            <span
              className="text-3xl leading-none"
              role="img"
              aria-label={headerCondition?.description || 'Weather'}
            >
              {headerCondition?.icon || '🌤️'}
            </span>
            <div>
              <div className="flex items-baseline gap-1.5">
                {headerCondition ? (
                  <>
                    <span className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">
                      {headerCondition.temperature}°
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">
                      {headerCondition.description}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-[var(--color-text-muted)]">
                    No forecast data
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-text-main)]">{forecast.locationName}</span>
                <span>·</span>
                <span>{headerDateLabel}</span>
              </div>
            </div>
          </div>

          {/* Secondary conditions */}
          {!isCompactHeight && headerCondition && (
            <div className="flex flex-col items-end text-[11px] text-[var(--color-text-muted)] space-y-0.5">
              {headerCondition.apparentTemperature !== undefined && (
                <span>Feels {headerCondition.apparentTemperature}°</span>
              )}
              <div className="flex items-center gap-2 text-[10px]">
                {headerCondition.humidity !== undefined && (
                  <span className="inline-flex items-center gap-0.5" title={`Humidity: ${headerCondition.humidity}%`}>
                    <Droplets className="w-3 h-3 text-sky-500" />
                    {headerCondition.humidity}%
                  </span>
                )}
                {headerCondition.windSpeed !== undefined && (
                  <span className="inline-flex items-center gap-0.5" title={`Wind Speed: ${headerCondition.windSpeed} km/h`}>
                    <Wind className="w-3 h-3 text-teal-500" />
                    {headerCondition.windSpeed} km/h
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      {/* Horizontally Scrollable Hourly Strip */}
      <CardBody className="p-0 overflow-hidden">
        {isDateUnavailable ? (
          <div className="py-4 text-center text-xs text-[var(--color-text-muted)] italic">
            Weather forecast unavailable for this date
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            role="region"
            aria-label={`Hourly weather forecast for ${headerDateLabel}`}
            tabIndex={0}
            className="flex items-center gap-1.5 overflow-x-auto py-1.5 scrollbar-none no-scrollbar focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)] rounded-lg"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {dayHourlyEntries.map((hourItem: HourlyWeather) => {
              // Highlight NOW ONLY when viewing today and hour strictly matches currentLocalHour
              const isNow = isViewingToday && hourItem.hour === currentLocalHour
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
        )}
      </CardBody>
    </Card>
  )
}

