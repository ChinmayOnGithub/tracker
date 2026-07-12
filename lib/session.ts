import crypto from 'crypto'

const SESSION_SECRET = process.env.AUTH_SECRET || 'tracker-super-secret-key-108-multi-user-session-salt'
const SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1000 // 30 days session expiry

interface SessionPayload {
  userId: string
  username: string
  exp: number
}

/**
 * Creates a signed session token.
 */
export function signSession(userId: string, username: string): string {
  const payload: SessionPayload = {
    userId,
    username,
    exp: Date.now() + SESSION_EXPIRY
  }
  
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url')
  
  const hmac = crypto.createHmac('sha256', SESSION_SECRET)
  hmac.update(payloadStr)
  const signature = hmac.digest('base64url')
  
  return `${payloadStr}.${signature}`
}

/**
 * Verifies a session token. Returns null if expired, tampered, or missing.
 */
export function verifySession(token: string | undefined | null): { userId: string; username: string } | null {
  if (!token) return null
  
  const parts = token.split('.')
  if (parts.length !== 2) return null
  
  const [payloadStr, signature] = parts
  
  const hmac = crypto.createHmac('sha256', SESSION_SECRET)
  hmac.update(payloadStr)
  const expectedSignature = hmac.digest('base64url')
  
  // Protect against timing attacks
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null
  }
  
  try {
    const payloadJson = Buffer.from(payloadStr, 'base64url').toString('utf8')
    const payload: SessionPayload = JSON.parse(payloadJson)
    
    if (Date.now() > payload.exp) {
      return null // Expired
    }
    
    return { userId: payload.userId, username: payload.username }
  } catch {
    return null
  }
}
