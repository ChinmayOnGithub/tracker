import { describe, it, expect } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { CredentialService } from '@/lib/services/CredentialService'
import { SessionService } from '@/lib/services/SessionService'
import { AuthorizationService } from '@/lib/services/AuthorizationService'
import { AuthService } from '@/lib/services/AuthService'

describe('Architecture Boundary: Authentication & Session Authority', () => {
  const rootDir = process.cwd()

  it('app/actions/auth.ts acts as a thin adapter and does not implement independent hashing or raw DB auth', () => {
    const authActionPath = path.join(rootDir, 'app', 'actions', 'auth.ts')
    const content = fs.readFileSync(authActionPath, 'utf8')

    // Must delegate to AuthService / SessionService
    expect(content).toContain('AuthService.login')
    expect(content).toContain('SessionService.getSessionUser')

    // Must NOT contain direct crypto primitives or raw hash calculations
    expect(content).not.toContain('crypto.scryptSync')
    expect(content).not.toContain('crypto.pbkdf2Sync')
    expect(content).not.toContain('db.user.findFirst(')
  })

  it('CredentialService is the single authority for password hashing and verification', async () => {
    expect(typeof CredentialService.hashPassword).toBe('function')
    expect(typeof CredentialService.verifyPassword).toBe('function')
    expect(typeof CredentialService.validatePassword).toBe('function')

    const hashed = await CredentialService.hashPassword('SuperSecure123!', 'alice')
    expect(hashed.startsWith('scrypt:')).toBe(true)

    const isValid = await CredentialService.verifyPassword('SuperSecure123!', 'alice', hashed)
    expect(isValid).toBe(true)

    const isWrong = await CredentialService.verifyPassword('WrongPassword', 'alice', hashed)
    expect(isWrong).toBe(false)
  })

  it('SessionService is the single authority for session resolution and request authentication', () => {
    expect(typeof SessionService.getSessionUser).toBe('function')
    expect(typeof SessionService.resolveAuthFromRequest).toBe('function')
    expect(typeof SessionService.signSession).toBe('function')
    expect(typeof SessionService.verifySession).toBe('function')
  })

  it('AuthorizationService is the single authority for owner and module access decisions', () => {
    expect(typeof AuthorizationService.isOwner).toBe('function')
    expect(typeof AuthorizationService.canAccessModule).toBe('function')
    expect(typeof AuthorizationService.getAuthorizedPageContext).toBe('function')

    // Centralized owner check across admin username, owner flag, and allowed emails
    expect(AuthorizationService.isOwner({ username: 'admin' })).toBe(true)
    expect(AuthorizationService.isOwner({ isOwner: true })).toBe(true)
    expect(AuthorizationService.isOwner({ accessLevel: 'OWNER' })).toBe(true)
    expect(AuthorizationService.isOwner({ username: 'regular_user', isOwner: false })).toBe(false)
  })

  it('API routes do not implement custom cookie token parsers', () => {
    const apiRoutes = [
      'app/api/vault/upload/route.ts',
      'app/api/journal/upload/route.ts',
      'app/api/mobile/sync/route.ts',
    ]

    for (const routeRelPath of apiRoutes) {
      const fullPath = path.join(rootDir, routeRelPath)
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8')
        expect(content).toContain('SessionService.resolveAuthFromRequest')
      }
    }
  })

  it('AuthService provides canonical domain login and logout contracts', () => {
    expect(typeof AuthService.login).toBe('function')
    expect(typeof AuthService.logout).toBe('function')
  })
})
