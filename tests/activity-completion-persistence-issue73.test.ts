import { describe, it, expect } from 'bun:test'
import { CompletionService } from '@/lib/services/CompletionService'
import { ActivityTemplate, ActivityLog } from '@/types'

function createMockTemplate(overrides: Partial<ActivityTemplate>): ActivityTemplate {
  return {
    id: 'tpl-default',
    userId: 'user-default',
    name: 'Default Activity',
    category: 'general',
    type: 'PERSONAL',
    priority: 'NORMAL',
    estimatedDuration: 30,
    energyRequired: 'MEDIUM',
    calendarProvider: 'NONE',
    calendarEventId: null,
    notificationRules: null,
    icon: 'Activity',
    color: 'zinc',
    isActive: true,
    notes: null,
    amount: null,
    sortOrder: 1,
    recurrenceType: 'daily',
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: null,
    recurrenceDayOfMonth: null,
    recurrenceMonth: null,
    targetDate: null,
    remindBeforeDays: null,
    metadata: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

describe('Issue #73: Activity Completion Persistence & Canonical Payload', () => {
  const fuelTemplate = createMockTemplate({
    id: 'tpl-fuel',
    userId: 'user-alice',
    name: 'Fuel Refill',
    category: 'transport',
    icon: 'Fuel',
    color: 'amber',
    recurrenceType: 'custom',
    metadata: {
      completion: {
        method: 'VALUE',
        hook: 'none',
        value: {
          label: 'Liters Refilled',
          inputType: 'decimal',
          unit: 'L',
          required: true,
        },
      },
    },
  })

  const waterTemplate = createMockTemplate({
    id: 'tpl-water',
    userId: 'user-alice',
    name: 'Water Intake',
    category: 'health',
    icon: 'Droplet',
    color: 'blue',
    sortOrder: 2,
    metadata: {
      completion: {
        method: 'VALUE',
        hook: 'none',
        value: {
          label: 'Amount Drunk',
          inputType: 'number',
          unit: 'ml',
          required: true,
        },
      },
    },
  })

  const weightTemplate = createMockTemplate({
    id: 'tpl-weight',
    userId: 'user-alice',
    name: 'Morning Weigh-in',
    category: 'health',
    icon: 'Scale',
    color: 'emerald',
    priority: 'HIGH',
    sortOrder: 3,
    metadata: {
      completion: {
        method: 'VALUE',
        hook: 'weight',
        value: {
          label: 'Weight',
          inputType: 'decimal',
          unit: 'kg',
          required: true,
        },
      },
    },
  })

  it('Fuel 8.5 L persists as 8.5 L and formats properly', () => {
    const payload = { value: 8.5, unit: 'L' }
    const log: Partial<ActivityLog> = {
      id: 'log-fuel-8-5',
      activityId: fuelTemplate.id,
      amount: 8.5,
      payload,
    }

    const display = CompletionService.formatCompletionDisplay(fuelTemplate, log.payload, log.amount)
    expect(display).not.toBeNull()
    expect(display?.formatted).toBe('8.5 L')
    expect(display?.isMoney).toBe(false)
  })

  it('Fuel 12.5 L persists as 12.5 L and formats properly', () => {
    const payload = { value: 12.5, unit: 'L' }
    const log: Partial<ActivityLog> = {
      id: 'log-1',
      activityId: fuelTemplate.id,
      amount: 12.5,
      payload,
    }

    const display = CompletionService.formatCompletionDisplay(fuelTemplate, log.payload, log.amount)
    expect(display).not.toBeNull()
    expect(display?.formatted).toBe('12.5 L')
    expect(display?.isMoney).toBe(false)
  })

  it('Water 750 ml persists as 750 ml and formats properly', () => {
    const payload = { value: 750, unit: 'ml' }
    const log: Partial<ActivityLog> = {
      id: 'log-2',
      activityId: waterTemplate.id,
      amount: 750,
      payload,
    }

    const display = CompletionService.formatCompletionDisplay(waterTemplate, log.payload, log.amount)
    expect(display).not.toBeNull()
    expect(display?.formatted).toBe('750 ml')
    expect(display?.isMoney).toBe(false)
  })

  it('Decimal precision survives in payload.value and amount', () => {
    const decimalValue = 14.875
    const payload = { value: decimalValue, unit: 'L' }

    expect(payload.value).toBe(14.875)
    const display = CompletionService.formatCompletionDisplay(fuelTemplate, payload, decimalValue)
    expect(display?.formatted).toBe('14.875 L')
  })

  it('Value survives page reload when loaded from log.payload or fallback log.amount', () => {
    // Case 1: Full payload object exists
    const displayFromPayload = CompletionService.formatCompletionDisplay(fuelTemplate, { value: 12.5, unit: 'L' }, null)
    expect(displayFromPayload?.formatted).toBe('12.5 L')

    // Case 2: Only amount exists (legacy/fallback)
    const displayFromAmount = CompletionService.formatCompletionDisplay(fuelTemplate, null, 12.5)
    expect(displayFromAmount?.formatted).toBe('12.5 L')
  })

  it('Existing Weight completion hook continues working', () => {
    const config = CompletionService.getCompletionConfig(weightTemplate)
    expect(config.hook).toBe('weight')
    expect(config.method).toBe('VALUE')

    const display = CompletionService.formatCompletionDisplay(weightTemplate, { value: 68.4, unit: 'kg' }, 68.4)
    expect(display?.formatted).toBe('68.4 kg')
  })
})
