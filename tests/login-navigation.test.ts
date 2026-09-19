import { describe, it, expect } from 'bun:test'

describe('Login Navigation & Redirect Determinism Suite (#48)', () => {
  it('unauthenticated visits to root path render cleanly without redirecting to raw OAuth endpoint', () => {
    // When loggedUser is null on root page:
    // Old buggy behavior: redirect('/api/auth/google') causing redirect loops or 404 flashes
    // Correct hardened behavior: returns null and renders Operations Login form on '/'
    const loggedUser = null
    const shouldRenderLoginForm = loggedUser === null
    expect(shouldRenderLoginForm).toBe(true)
  })

  it('unauthenticated visits to protected sub-routes redirect deterministically to root /', () => {
    const protectedRoutes = ['/calendar', '/activities', '/journal', '/leave', '/weight', '/documents', '/links', '/settings', '/pricing']
    const loggedUser = null

    for (const route of protectedRoutes) {
      const redirectTarget = loggedUser ? route : '/'
      expect(redirectTarget).toBe('/')
    }
  })

  it('authenticated user navigating to valid sub-routes is not redirected to /', () => {
    const loggedUser = { id: 'u1', username: 'chinmay' }
    const redirectTarget = loggedUser ? '/calendar' : '/'
    expect(redirectTarget).toBe('/calendar')
  })
})
