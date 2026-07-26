import { ActivityTemplate } from '@/types'

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
    return meta.completion || { method: 'CHECKBOX', hook: 'none' }
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
}
