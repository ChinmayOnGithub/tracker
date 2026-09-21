import { ActivityTemplate, CompletionSchema } from '@/types'

export interface CompletionConfig {
  method: 'CHECKBOX' | 'VALUE' | 'FORM'
  hook?: string
  value?: {
    label: string
    unit?: string
    required?: boolean
    inputType?: 'number' | 'decimal' | 'currency' | 'text' | 'duration' | 'percentage'
    minimum?: number | null
    maximum?: number | null
  }
  schema?: CompletionSchema
  form?: CompletionSchema
}

export class CompletionService {
  /**
   * Resolves the completion config for a template.
   */
  static getCompletionConfig(template: ActivityTemplate): CompletionConfig {
    const meta = typeof template.metadata === 'string'
      ? JSON.parse(template.metadata)
      : template.metadata || {}
    
    // Default to CHECKBOX with no hook
    const comp = meta.completion || { method: 'CHECKBOX', hook: 'none' }
    if (comp.form && !comp.schema) {
      comp.schema = comp.form
    }
    return comp
  }

  /**
   * Check if a template actually needs prompting based on config and context.
   */
  static needsPrompting(template: ActivityTemplate, isWeightLoggedToday: boolean): boolean {
    const config = this.getCompletionConfig(template)
    if (config.hook === 'weight' && isWeightLoggedToday) {
      return false
    }
    return config.method === 'VALUE' || config.method === 'FORM'
  }

  /**
   * Validates custom value input based on config constraints.
   */
  static validateInput(config: CompletionConfig, inputStr: string): { success: boolean; error?: string; parsedValue?: string | number | boolean | null } {
    if (config.method !== 'VALUE' || !config.value) {
      return { success: true }
    }

    const { required, minimum, maximum, inputType } = config.value
    const trimmed = inputStr.trim()

    if (trimmed === '') {
      if (required) {
        return { success: false, error: `${config.value.label || 'Value'} is required.` }
      }
      return { success: true, parsedValue: null }
    }

    const isNumeric = ['number', 'decimal', 'currency', 'percentage', 'duration'].includes(inputType || 'number')

    if (isNumeric) {
      const num = Number(trimmed)
      if (isNaN(num)) {
        return { success: false, error: 'Please enter a valid number.' }
      }
      if (minimum !== undefined && minimum !== null && num < minimum) {
        return { success: false, error: `Value must be at least ${minimum}.` }
      }
      if (maximum !== undefined && maximum !== null && num > maximum) {
        return { success: false, error: `Value must be at most ${maximum}.` }
      }
      return { success: true, parsedValue: num }
    }

    return { success: true, parsedValue: trimmed }
  }

  /**
   * Validates dynamic form submission against a CompletionSchema.
   */
  static validateForm(
    schema: CompletionSchema,
    values: Record<string, unknown>
  ): { success: boolean; error?: string; parsedValues?: Record<string, unknown> } {
    const parsed: Record<string, unknown> = {}

    for (const field of schema.fields) {
      const raw = values[field.id]
      const strVal = raw !== undefined && raw !== null ? String(raw).trim() : ''

      if (field.required && (strVal === '' || raw === undefined || raw === null)) {
        return { success: false, error: `${field.label} is required.` }
      }

      if (strVal === '') {
        parsed[field.id] = null
        continue
      }

      if (field.type === 'number' || field.type === 'decimal' || field.type === 'duration') {
        const num = Number(strVal)
        if (isNaN(num)) {
          return { success: false, error: `${field.label} must be a valid number.` }
        }
        if (field.min !== undefined && field.min !== null && num < field.min) {
          return { success: false, error: `${field.label} must be at least ${field.min}.` }
        }
        if (field.max !== undefined && field.max !== null && num > field.max) {
          return { success: false, error: `${field.label} must be at most ${field.max}.` }
        }
        parsed[field.id] = num
      } else if (field.type === 'boolean') {
        parsed[field.id] = Boolean(raw)
      } else if (field.type === 'select') {
        if (field.options && field.options.length > 0 && !field.options.includes(strVal)) {
          return { success: false, error: `${field.label} contains an invalid selection.` }
        }
        parsed[field.id] = strVal
      } else {
        parsed[field.id] = strVal
      }
    }

    return { success: true, parsedValues: parsed }
  }

  /**
   * Formats the completion display representation for tasks and habit occurrences.
   * Handles:
   * - Generic VALUE activities (e.g. Fuel 12.5 L, Water 750 ml)
   * - Multi-field FORM activities (e.g. 12.5 L · ₹1200, 3 sets · 10 reps)
   * - Monetary / financial activities
   */
  static formatCompletionDisplay(
    template: ActivityTemplate | null | undefined,
    payload: unknown,
    amount?: number | null
  ): { formatted: string; isMoney: boolean } | null {
    const config = template ? this.getCompletionConfig(template) : null

    // 1. Check if FORM payload
    if (config?.method === 'FORM') {
      const formValues = (payload && typeof payload === 'object')
        ? ((payload as Record<string, unknown>).value ?? (payload as Record<string, unknown>).values ?? payload)
        : null

      if (formValues && typeof formValues === 'object') {
        const parts: string[] = []
        const schema = config.schema || config.form
        if (schema && schema.fields) {
          for (const field of schema.fields) {
            const val = (formValues as Record<string, unknown>)[field.id]
            if (val !== undefined && val !== null && val !== '') {
              const unitStr = field.unit ? ` ${field.unit}` : ''
              parts.push(`${val}${unitStr}`)
            }
          }
        } else {
          for (const [key, val] of Object.entries(formValues)) {
            if (val !== undefined && val !== null && val !== '') {
              parts.push(`${key}: ${val}`)
            }
          }
        }
        if (parts.length > 0) {
          return { formatted: parts.join(' · '), isMoney: false }
        }
      }
    }

    // 2. Check if VALUE payload
    if (config?.method === 'VALUE') {
      let rawVal: unknown = null
      if (payload && typeof payload === 'object' && 'value' in (payload as Record<string, unknown>)) {
        rawVal = (payload as Record<string, unknown>).value
      } else if (payload !== undefined && payload !== null) {
        rawVal = payload
      } else if (amount !== null && amount !== undefined) {
        rawVal = amount
      }

      if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
        const unit = config.value?.unit
        const inputType = config.value?.inputType

        if (inputType === 'currency' || unit === '₹' || template?.category === 'finance') {
          const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal))
          if (!isNaN(num)) {
            const currSymbol = unit || '₹'
            return { formatted: `${currSymbol}${num.toFixed(2)}`, isMoney: true }
          }
        }

        const unitSuffix = unit ? ` ${unit}` : ''
        return { formatted: `${rawVal}${unitSuffix}`, isMoney: false }
      }
    }

    // 3. Fallback to numeric amount
    const effectiveAmount = amount ?? template?.amount ?? null
    if (effectiveAmount !== null && effectiveAmount !== undefined) {
      if (template?.category === 'finance') {
        return { formatted: `₹${effectiveAmount.toFixed(2)}`, isMoney: true }
      }
      return { formatted: `${effectiveAmount}`, isMoney: false }
    }

    return null
  }
}
