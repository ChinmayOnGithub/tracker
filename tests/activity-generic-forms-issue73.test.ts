import { describe, it, expect } from 'bun:test'
import { CompletionService } from '@/lib/services/CompletionService'
import { CompletionSchema, ActivityTemplate } from '@/types'

describe('Issue #73: Generic Interactive Activity Forms', () => {
  it('validates and formats Fuel schema (Liters, Cost)', () => {
    const fuelSchema: CompletionSchema = {
      fields: [
        { id: 'liters', label: 'Liters', type: 'decimal', unit: 'L', required: true, min: 0.1 },
        { id: 'cost', label: 'Cost', type: 'decimal', unit: '₹', required: false, min: 0 },
      ],
    }

    // Required field missing
    const invalidValidation = CompletionService.validateForm(fuelSchema, { cost: 1200 })
    expect(invalidValidation.success).toBe(false)
    expect(invalidValidation.error).toContain('Liters is required')

    // Min value violation
    const minViolation = CompletionService.validateForm(fuelSchema, { liters: 0, cost: 0 })
    expect(minViolation.success).toBe(false)
    expect(minViolation.error).toContain('at least 0.1')

    // Valid values
    const valid = CompletionService.validateForm(fuelSchema, { liters: '12.5', cost: '1250.50' })
    expect(valid.success).toBe(true)
    expect(valid.parsedValues?.liters).toBe(12.5)
    expect(valid.parsedValues?.cost).toBe(1250.5)

    // Formatted display
    const fuelTemplate: Partial<ActivityTemplate> = {
      metadata: {
        completion: {
          method: 'FORM',
          schema: fuelSchema,
        },
      },
    }

    const display = CompletionService.formatCompletionDisplay(
      fuelTemplate as ActivityTemplate,
      { value: valid.parsedValues }
    )
    expect(display?.formatted).toBe('12.5 L · 1250.5 ₹')
  })

  it('validates and formats Water schema (Amount, Unit)', () => {
    const waterSchema: CompletionSchema = {
      fields: [
        { id: 'amount', label: 'Amount', type: 'number', required: true, min: 1 },
        { id: 'unit', label: 'Unit', type: 'select', options: ['ml', 'L', 'glasses'], required: true },
      ],
    }

    const invalidUnit = CompletionService.validateForm(waterSchema, { amount: 500, unit: 'gallons' })
    expect(invalidUnit.success).toBe(false)
    expect(invalidUnit.error).toContain('invalid selection')

    const valid = CompletionService.validateForm(waterSchema, { amount: 750, unit: 'ml' })
    expect(valid.success).toBe(true)
    expect(valid.parsedValues?.amount).toBe(750)
    expect(valid.parsedValues?.unit).toBe('ml')
  })

  it('validates and formats Reading schema (Pages, Minutes)', () => {
    const readingSchema: CompletionSchema = {
      fields: [
        { id: 'pages', label: 'Pages Read', type: 'number', unit: 'pages', required: true, min: 1 },
        { id: 'minutes', label: 'Time Spent', type: 'duration', unit: 'mins', required: false },
      ],
    }

    const valid = CompletionService.validateForm(readingSchema, { pages: 30, minutes: 45 })
    expect(valid.success).toBe(true)
    expect(valid.parsedValues?.pages).toBe(30)
    expect(valid.parsedValues?.minutes).toBe(45)

    const template: Partial<ActivityTemplate> = {
      metadata: {
        completion: {
          method: 'FORM',
          schema: readingSchema,
        },
      },
    }

    const display = CompletionService.formatCompletionDisplay(
      template as ActivityTemplate,
      { value: valid.parsedValues }
    )
    expect(display?.formatted).toBe('30 pages · 45 mins')
  })

  it('validates and formats Workout schema (Sets, Reps, Weight)', () => {
    const workoutSchema: CompletionSchema = {
      fields: [
        { id: 'sets', label: 'Sets', type: 'number', required: true, min: 1 },
        { id: 'reps', label: 'Reps', type: 'number', required: true, min: 1 },
        { id: 'weight', label: 'Weight', type: 'decimal', unit: 'kg', required: false },
      ],
    }

    const valid = CompletionService.validateForm(workoutSchema, { sets: 4, reps: 10, weight: 65.5 })
    expect(valid.success).toBe(true)
    expect(valid.parsedValues?.sets).toBe(4)
    expect(valid.parsedValues?.reps).toBe(10)
    expect(valid.parsedValues?.weight).toBe(65.5)

    const template: Partial<ActivityTemplate> = {
      metadata: {
        completion: {
          method: 'FORM',
          schema: workoutSchema,
        },
      },
    }

    const display = CompletionService.formatCompletionDisplay(
      template as ActivityTemplate,
      { value: valid.parsedValues }
    )
    expect(display?.formatted).toBe('4 · 10 · 65.5 kg')
  })
})
