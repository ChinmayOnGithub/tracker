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
