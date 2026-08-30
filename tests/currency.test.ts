import { describe, it, expect } from 'bun:test'
import { formatMoney, formatMoneyRich, formatMoneyString } from '../lib/formatMoney'

describe('FormatMoney and Currency Conversion Helper', () => {
  it('should format standard INR amounts properly', () => {
    expect(formatMoney(119)).toBe('₹119')
    expect(formatMoney(2430.50)).toBe('₹2,430.50')
    expect(formatMoney('5000')).toBe('₹5,000')
    expect(formatMoney(null)).toBeNull()
    expect(formatMoney(undefined)).toBeNull()
  })

  it('should format foreign currency amounts and keep original stored currency', () => {
    const usdResult = formatMoneyRich(9.99, '$')
    expect(usdResult?.formatted).toBe('$9.99')

    const eurResult = formatMoneyRich(15, '€')
    expect(eurResult?.formatted).toBe('€15')
  })

  it('should format legacy money strings seamlessly', () => {
    expect(formatMoneyString(1500)).toBe('₹1,500')
    expect(formatMoneyString(null)).toBeNull()
  })
})
