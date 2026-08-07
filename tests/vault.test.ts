import { describe, it, expect } from 'bun:test'
import { encryptTitle, decryptTitle, maskValue } from '../lib/vault-crypto'

describe('Vault Masking Utility', () => {
  it('should mask Aadhaar number correctly', () => {
    expect(maskValue('identity_aadhaar', '1234 5678 9012')).toBe('XXXX XXXX 9012')
    expect(maskValue('identity_aadhaar', '123456789012')).toBe('XXXX XXXX 9012')
    expect(maskValue('identity_aadhaar', '12')).toBe('XXXX XXXX XXXX')
  })

  it('should mask PAN number correctly', () => {
    expect(maskValue('identity_pan', 'ABCDE1234F')).toBe('ABCDE••••F')
    expect(maskValue('identity_pan', 'ABC')).toBe('••••••••••')
  })

  it('should mask Bank Account Number correctly', () => {
    expect(maskValue('banking_account_number', '12345678901234')).toBe('••••••••1234')
    expect(maskValue('banking_account_number', '123')).toBe('••••••••')
  })

  it('should mask Passport / DL / Voter IDs correctly', () => {
    expect(maskValue('identity_passport', 'Z1234567')).toBe('••••••••4567')
    expect(maskValue('identity_dl', 'DL12345')).toBe('••••••••2345')
  })

  it('should mask email addresses correctly', () => {
    expect(maskValue('personal_email', 'john.doe@example.com')).toBe('jo••••@example.com')
    expect(maskValue('personal_email', 'a@b.com')).toBe('••••@b.com')
  })

  it('should mask phone numbers and full names to show only last 4 chars', () => {
    expect(maskValue('personal_phone', '+1234567890')).toBe('••••7890')
    expect(maskValue('personal_full_name', 'Chinmay')).toBe('••••nmay')
  })
})

describe('Vault AES-256-GCM Encryption', () => {
  it('should encrypt and decrypt values symmetrically', () => {
    const secret = 'My super secret value 123!'
    const encrypted = encryptTitle(secret)
    expect(encrypted).toBeDefined()
    expect(encrypted).toContain(':')
    expect(encrypted.split(':').length).toBe(3) // iv:ciphertext:tag
    
    const decrypted = decryptTitle(encrypted)
    expect(decrypted).toBe(secret)
  })

  it('should fail decryption on tampered inputs', () => {
    const secret = 'Another secret'
    const encrypted = encryptTitle(secret)
    const [iv, ciphertext, tag] = encrypted.split(':')
    
    // Tamper ciphertext
    const tampered = `${iv}:${ciphertext}a:${tag}`
    expect(() => decryptTitle(tampered)).toThrow()
  })
})
