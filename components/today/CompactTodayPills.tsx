"use client"

import React, { useEffect, useState } from 'react'
import { WeatherService, WeatherSnapshot } from '@/lib/services/WeatherService'
import { GoldPriceService, GoldPriceSnapshot } from '@/lib/services/GoldPriceService'

export const CompactTodayPills: React.FC = () => {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => WeatherService.getCachedSnapshot())
  const [gold, setGold] = useState<GoldPriceSnapshot | null>(() => GoldPriceService.getCachedSnapshot())

  useEffect(() => {
    // Background non-blocking fetches
    WeatherService.fetchWeather().then(res => {
      if (res) setWeather(res)
    })
    GoldPriceService.fetchGoldPrice().then(res => {
      if (res) setGold(res)
    })
  }, [])

  if (!weather && !gold) return null

  return (
    <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--color-text-muted)] select-none">
      {weather && (
        <span
          className="inline-flex items-center gap-1 hover:text-[var(--color-text-main)] transition-colors cursor-default"
          title={`Weather: ${weather.tempC}°C, ${weather.description}`}
        >
          <span>{weather.icon}</span>
          <span>{weather.tempC}°C · {weather.description}</span>
        </span>
      )}

      {weather && gold && <span className="opacity-30">·</span>}

      {gold && (
        <span
          className="inline-flex items-center gap-1 hover:text-[var(--color-text-main)] transition-colors cursor-default"
          title="Market reference gold rate per 10 grams (24K)"
        >
          <span className="font-semibold text-amber-500/90">Gold 24K</span>
          <span>₹{(gold.pricePer10Gram24K || gold.pricePerGram24K * 10).toLocaleString('en-IN')}/10g</span>
          {gold.dailyChangePct != null && (
            <span className="text-emerald-500 text-[10px] font-bold">↑{gold.dailyChangePct}%</span>
          )}
        </span>
      )}
    </div>
  )
}
