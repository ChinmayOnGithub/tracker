import { CurrencyService } from './services/CurrencyService'

/**
 * Shared money formatting helper for Tracker tasks, templates, and logs.
 * Formats financial amounts clearly (e.g. ₹119, ₹2,430, $9.99 or $9.99 ≈ ₹855) without inventing values.
 * Stored values and currencies remain non-destructively preserved.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = '₹',
  showDerivedConversion = false
): string | null {
  if (amount === null || amount === undefined || amount === '') {
    return null
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) {
    return null
  }

  // Format with integer vs fractional decimal display
  const isIndianRupee = currency === '₹' || currency.toUpperCase() === 'INR'
  const locale = isIndianRupee ? 'en-IN' : 'en-US'

  const formattedNumber = Number.isInteger(num)
    ? num.toLocaleString(locale)
    : num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const formatted = `${currency}${formattedNumber}`

  // Check if foreign currency requires derived INR conversion display
  if (showDerivedConversion && !isIndianRupee) {
    let foreignCode = 'USD'
    if (currency === '$' || currency.toUpperCase() === 'USD') foreignCode = 'USD'
    else if (currency === '€' || currency.toUpperCase() === 'EUR') foreignCode = 'EUR'
    else if (currency === '£' || currency.toUpperCase() === 'GBP') foreignCode = 'GBP'

    const derived = CurrencyService.formatForeignWithDerived(num, currency, foreignCode, '₹')
    if (derived?.converted) {
      return `${formatted} (${derived.converted})`
    }
  }

  return formatted
}

/**
 * Rich object formatter for components that want structured display
 */
export function formatMoneyRich(
  amount: number | string | null | undefined,
  currency: string = '₹'
): { formatted: string; derived?: string } | null {
  if (amount === null || amount === undefined || amount === '') {
    return null
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) {
    return null
  }

  const isIndianRupee = currency === '₹' || currency.toUpperCase() === 'INR'
  const locale = isIndianRupee ? 'en-IN' : 'en-US'

  const formattedNumber = Number.isInteger(num)
    ? num.toLocaleString(locale)
    : num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const formatted = `${currency}${formattedNumber}`

  if (!isIndianRupee) {
    let foreignCode = 'USD'
    if (currency === '$' || currency.toUpperCase() === 'USD') foreignCode = 'USD'
    else if (currency === '€' || currency.toUpperCase() === 'EUR') foreignCode = 'EUR'
    else if (currency === '£' || currency.toUpperCase() === 'GBP') foreignCode = 'GBP'

    const derived = CurrencyService.formatForeignWithDerived(num, currency, foreignCode, '₹')
    if (derived?.converted) {
      return { formatted, derived: derived.converted }
    }
  }

  return { formatted }
}

export const formatMoneyString = formatMoney


