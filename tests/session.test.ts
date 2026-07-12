import { expect, test, describe } from "bun:test"
import { signSession, verifySession } from "../lib/session"
import crypto from 'crypto'

describe("Session Management", () => {
  test("should sign and verify session tokens successfully", () => {
    const userId = "user-123"
    const username = "chinmay"
    
    const token = signSession(userId, username)
    expect(token).toBeDefined()
    expect(token.split('.').length).toBe(2)
    
    const verified = verifySession(token)
    expect(verified).not.toBeNull()
    expect(verified?.userId).toBe(userId)
    expect(verified?.username).toBe(username)
  })

  test("should return null for invalid or tampered tokens", () => {
    const userId = "user-123"
    const username = "chinmay"
    
    const token = signSession(userId, username)
    const [payload, signature] = token.split('.')
    
    // Modify payload slightly
    const tamperedPayload = payload + "a"
    const tamperedToken = `${tamperedPayload}.${signature}`
    
    expect(verifySession(tamperedToken)).toBeNull()
    expect(verifySession("invalid-token")).toBeNull()
    expect(verifySession(null)).toBeNull()
  })

  test("should return null for expired tokens", () => {
    const expiredPayload = Buffer.from(JSON.stringify({
      userId: "user-123",
      username: "chinmay",
      exp: Date.now() - 1000 // 1 second ago
    })).toString('base64url')
    
    const secret = process.env.AUTH_SECRET || 'tracker-super-secret-key-108-multi-user-session-salt'
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(expiredPayload)
    const signature = hmac.digest('base64url')
    
    const expiredToken = `${expiredPayload}.${signature}`
    expect(verifySession(expiredToken)).toBeNull()
  })
})
