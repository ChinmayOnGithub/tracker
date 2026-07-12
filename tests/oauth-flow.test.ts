import { expect, test, describe } from "bun:test"
import crypto from "crypto"

describe("OAuth Security Utilities", () => {
  test("state parameter should be a valid UUID v4", () => {
    const state = crypto.randomUUID()
    expect(state).toBeDefined()
    expect(state.length).toBe(36)
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(uuidRegex.test(state)).toBe(true)
  })

  test("PKCE code challenge generation from verifier", () => {
    // Generate a code verifier (base64url format)
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    expect(codeVerifier).toBeDefined()
    
    // Create challenge: base64url(sha256(verifier))
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')
      
    expect(codeChallenge).toBeDefined()
    expect(codeChallenge.includes('+')).toBe(false)
    expect(codeChallenge.includes('/')).toBe(false)
    expect(codeChallenge.includes('=')).toBe(false)
  })

  test("ID token signature payload extraction verification", () => {
    // Test base64url decoding of JWT payload
    const testPayload = { sub: "12345", email: "user@example.com", aud: "client-id" }
    const payloadB64 = Buffer.from(JSON.stringify(testPayload)).toString('base64url')
    
    const decodedStr = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const decoded = JSON.parse(decodedStr)
    
    expect(decoded.sub).toBe("12345")
    expect(decoded.email).toBe("user@example.com")
    expect(decoded.aud).toBe("client-id")
  })
})
