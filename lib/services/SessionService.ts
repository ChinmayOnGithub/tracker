import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { signSession, verifySession } from '@/lib/session'
import { AuthorizationService, AuthenticatedUser } from './AuthorizationService'

export class SessionService {
  public static signSession = signSession
  public static verifySession = verifySession

  /**
   * Resolves the authenticated user from a signed session token string.
   */
  public static async resolveUserFromToken(token: string | null | undefined): Promise<AuthenticatedUser | null> {
    if (!token) return null
    const session = verifySession(token)
    if (!session) return null

    // Look up user in database to obtain associated email and verify owner status
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, email: true }
    })

    if (!user) return null

    const isOwner = AuthorizationService.isOwner(user)
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isOwner,
    }
  }

  /**
   * Retrieves the currently logged-in user from the signed session token cookie.
   * Safe for Server Components, Route Handlers, and Server Actions.
   */
  public static async getSessionUser(): Promise<AuthenticatedUser | null> {
    try {
      const cookieStore = await cookies()
      const token = cookieStore.get('session_token')?.value
      return await this.resolveUserFromToken(token)
    } catch (error) {
      console.error('[SessionService] Failed to resolve session user from cookies:', error)
      return null
    }
  }

  /**
   * Resolves authentication from an HTTP Request (checking Authorization: Bearer <token> or Cookie).
   * Authoritative handler for all API Route handlers.
   */
  public static async resolveAuthFromRequest(request: Request): Promise<AuthenticatedUser | null> {
    // 1. Check Authorization: Bearer header (Mobile/API transport)
    const authHeader = request.headers.get('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim()
      return this.resolveUserFromToken(token)
    }

    // 2. Check Cookie header (Browser transport)
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      const match = cookieHeader.match(/session_token=([^;]+)/)
      if (match && match[1]) {
        return this.resolveUserFromToken(decodeURIComponent(match[1]))
      }
    }

    // 3. Fallback to next/headers cookies if available
    try {
      const cookieStore = await cookies()
      const token = cookieStore.get('session_token')?.value
      if (token) {
        return this.resolveUserFromToken(token)
      }
    } catch {
      // In standalone request contexts where cookies() is unavailable
    }

    return null
  }

  /**
   * Sets the signed session token cookie with production-grade security flags.
   */
  public static async setSessionCookie(token: string): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })
  }

  /**
   * Invalidates the active session by deleting the session cookie.
   */
  public static async invalidateSession(): Promise<void> {
    try {
      const cookieStore = await cookies()
      cookieStore.delete('session_token')
    } catch (error) {
      console.error('[SessionService] Failed to delete session cookie:', error)
    }
  }

  /**
   * Enforces session requirement, throwing if unauthenticated.
   */
  public static async requireSession(): Promise<AuthenticatedUser> {
    const user = await this.getSessionUser()
    if (!user) {
      throw new Error('Authentication required')
    }
    return user
  }
}
