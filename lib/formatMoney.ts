/**
 * Shared money formatting helper for Tracker tasks, templates, and logs.
 * Formats financial amounts clearly (e.g. ₹119, ₹2,430, ₹150.50) without inventing values.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = '₹'
): string | null {
  if (amount === null || amount === undefined || amount === '') {
    return null
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) {
    return null
  }

  // Format with integer vs fractional decimal display
  const formattedNumber = Number.isInteger(num)
    ? num.toLocaleString('en-IN')
    : num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return `${currency}${formattedNumber}`
}
