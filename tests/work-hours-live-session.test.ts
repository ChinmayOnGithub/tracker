import { describe, expect, it } from 'bun:test'
import { calculateLiveOfficeSessionSeconds } from '@/components/today/widgets/WorkHoursWidget'

describe('Work Hours live office calculation', () => {
  it('counts only the currently running segment', () => {
    expect(calculateLiveOfficeSessionSeconds('running', 3 * 3600 + 17, 2 * 3600)).toBe(3600 + 17)
  })

  it('does not add paused accumulated time a second time', () => {
    expect(calculateLiveOfficeSessionSeconds('paused', 2 * 3600, 2 * 3600)).toBe(0)
  })

  it('does not add completed time a second time', () => {
    expect(calculateLiveOfficeSessionSeconds('completed', 8 * 3600, 8 * 3600)).toBe(0)
  })

  it('never produces a negative live segment', () => {
    expect(calculateLiveOfficeSessionSeconds('running', 100, 200)).toBe(0)
  })
})
