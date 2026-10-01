import { describe, expect, it } from 'bun:test'
import { resolveWorkSessionStart } from '@/components/today/widgets/WorkHoursWidget'

describe('Work Hours new session start', () => {
  it('starts a completed session at the current time and resets duration', () => {
    const now = new Date('2026-10-01T18:00:00')
    const result = resolveWorkSessionStart('completed', '09:00', '2026-10-01', now)
    expect(result.inTime).toBe('18:00')
    expect(result.start).toEqual(now)
    expect(result.resetAccumulatedSeconds).toBe(true)
  })

  it('uses the configured start time when starting from idle', () => {
    const now = new Date('2026-10-01T10:00:00')
    const result = resolveWorkSessionStart('idle', '09:00', '2026-10-01', now)
    expect(result.inTime).toBe('09:00')
    expect(result.start.getHours()).toBe(9)
    expect(result.start.getMinutes()).toBe(0)
  })
})