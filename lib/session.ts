import crypto from 'crypto'

function getSessionSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET environment variable is missing in production')
    }
    return 'tracker-super-secret-key-108-multi-user-session-salt'
  }
  return secret
}

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
  
  const hmac = crypto.createHmac('sha256', getSessionSecret())
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
  
  try {
    const hmac = crypto.createHmac('sha256', getSessionSecret())
    hmac.update(payloadStr)
    const expectedSignature = hmac.digest('base64url')
    
    // Protect against timing attacks by hashing both signatures to 32-byte fixed-length digests
    const sigHash = crypto.createHash('sha256').update(signature).digest()
    const expHash = crypto.createHash('sha256').update(expectedSignature).digest()
    
    if (!crypto.timingSafeEqual(sigHash, expHash)) {
      return null
    }
    
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
