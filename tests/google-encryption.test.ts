import { expect, test, describe } from "bun:test"
import { GoogleCredentialService } from "../modules/sync/google-calendar/services/GoogleCredentialService"

describe("Google Token Encryption", () => {
  test("should encrypt and decrypt refresh tokens successfully", () => {
    const plainToken = "1//0gV-some-refresh-token-with-long-length-12345"
    
    const encrypted = GoogleCredentialService.encrypt(plainToken)
    expect(encrypted).toBeDefined()
    expect(encrypted.split(':').length).toBe(3) // iv:data:tag
    
    const decrypted = GoogleCredentialService.decrypt(encrypted)
    expect(decrypted).toBe(plainToken)
  })

  test("should fail decryption if data or tag is tampered with", () => {
    const plainToken = "1//0gV-some-refresh-token-with-long-length-12345"
    const encrypted = GoogleCredentialService.encrypt(plainToken)
    
    const [iv, data, tag] = encrypted.split(':')
    
    // Tamper with data part (guaranteeing change)
    const lastTwo = data.slice(-2)
    const tamperedData = data.slice(0, -2) + (lastTwo === "00" ? "ff" : "00")
    const tamperedEncrypted = `${iv}:${tamperedData}:${tag}`
    
    expect(() => GoogleCredentialService.decrypt(tamperedEncrypted)).toThrow()
  })

  test("should fail decryption for malformed encrypted payloads", () => {
    expect(() => GoogleCredentialService.decrypt("invalid-encrypted-payload")).toThrow()
  })
})
