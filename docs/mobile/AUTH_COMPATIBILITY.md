# Authentication Compatibility Specification: Web & Mobile

> **Status**: Architectural Standard  
> **Scope**: Next.js Web App & Future Expo Mobile App

---

## 1. Current Authentication Architecture

### 1.1 Credential & Identity Provider
- **Primary Mechanism**: Unique lowercase `username` + 4-digit numeric `pin`.
- **Password Hashing**: PBKDF2 with SHA-512, 1000 iterations, 64-byte key length.
- **Salt Policy**: Per-user dynamic salt derived from `AUTH_SALT` combined with the user's lowercase username (`${SALT}-${username.toLowerCase()}`).
- **Secondary Identity**: Optional Google OAuth linking to `googleId` and `email` on the `User` model.

### 1.2 Session Token Generation & Verification
Tracker utilizes a custom, lightweight, cryptographically secure signed session mechanism implemented in `lib/session.ts`:
- **Payload**:
  ```ts
  interface SessionPayload {
    userId: string
    username: string
    exp: number // 30-day epoch timestamp
  }
  ```
- **Serialization**: `base64url(JSON.stringify(payload))`
- **Signature**: HMAC-SHA256 using `SESSION_SECRET` over the base64url payload.
- **Token Format**: `${payloadStr}.${signature}`
- **Constant-Time Verification**: `verifySession(token)` compares signature hashes using `crypto.timingSafeEqual` to prevent timing attacks, and checks if `Date.now() > payload.exp`.

### 1.3 Web Transport
On the web, `app/actions/auth.ts` sets the token in an `httpOnly` cookie:
```ts
cookieStore.set('session_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60, // 30 days
  path: '/'
})
```

---

## 2. Mobile Client Compatibility Analysis

### 2.1 Can the Existing System Support Mobile Without a Rewrite?
**Yes, 100%**.
- The signed token in `lib/session.ts` is completely platform-neutral.
- It is a self-contained, stateless, tamper-evident token requiring no Node.js or browser-specific globals to parse.
- It is already accepted via `Authorization: Bearer <token>` in `app/api/mobile/sync/route.ts`.
- Introducing third-party auth services (Firebase, Auth0, Supabase Auth) or a complex asymmetric JWT infrastructure (RS256 with JWKS) is **unnecessary, risky, and adds heavy external dependencies**.

### 2.2 Are Access & Refresh Token Pairs Necessary?
**No**.
- The personal operating system model favors long-lived, seamless authentication (like Apple Notes or Things 3).
- A 30-day HMAC session token stored securely on the mobile device matches Tracker's offline-first paradigm.
- Requiring frequent token refresh cycles would create unnecessary offline synchronization failures when the device is disconnected from the internet for days.

---

## 3. Unified Identity Resolution Pattern

To support both Web (cookies) and Mobile (`Authorization: Bearer`), authentication resolution is unified into a single helper:

```
                  Incoming Request
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   Web Request                      Mobile Request
   (Cookie: session_token)          (Header: Authorization: Bearer <token>)
        │                                 │
        └────────────────┬────────────────┘
                         ▼
             Extract Session Token
                         │
                         ▼
        lib/session.ts :: verifySession(token)
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   Invalid / Expired               Valid Signature & Exp
   Return 401 Unauthenticated      Extract { userId, username }
                                          │
                                          ▼
                                   db.user.findUnique
                                          │
                                          ▼
                                   Security Context
                                   { user, isOwner }
```

### Server Action vs. Route Handler Authentication
- **Web Server Actions (`app/actions/*`)**:
  Call `requireAuth()` in `lib/auth-guards.ts`, which reads `cookies().get('session_token')`.
- **Mobile Route Handlers (`app/api/mobile/v1/*`)**:
  Extract `request.headers.get('Authorization')` (`Bearer <token>`). If omitted, fallback to reading the cookie to allow seamless browser testing.

---

## 4. Mobile Token Storage & Security Rules

### 4.1 Storage Requirements
- **Mandatory**: Store session tokens exclusively in **Hardware-Backed Secure Storage**:
  - iOS: Keychain via `expo-secure-store`.
  - Android: EncryptedSharedPreferences / Android Keystore via `expo-secure-store`.
- **Strictly Prohibited**: Never store session tokens in plain `AsyncStorage`, `localStorage`, or unencrypted files.

### 4.2 Handling Expiry & Re-Authentication
- The token payload specifies a 30-day expiration (`exp`).
- If an API returns `401 UNAUTHENTICATED`, the mobile client:
  1. Purges the invalid token from `SecureStore`.
  2. Updates local auth state to unauthenticated.
  3. Displays the PIN entry screen.
  4. Retains queued offline mutations in the local durable database so the user does not lose pending entries upon logging back in.

### 4.3 Account Switching & Multi-User Isolation
- When switching accounts on mobile:
  1. The existing session token is cleared.
  2. The local database isolates data by `userId` or flushes uncommitted cached reads for the prior user.
  3. The new account signs in and receives its own signed token.

---

## 5. Multi-Tenant Account Isolation Rules

1. **Zero Client Trust**:
   Never trust `userId`, `ownerId`, or `accountId` sent in URL parameters, request headers, or JSON bodies.
2. **Server Enforcement**:
   Every database query must bind `where: { userId: session.userId }` derived exclusively from the verified token.
3. **Ownership Verification**:
   Before modifying any existing entity, the server must verify ownership:
   ```ts
   const existing = await db.activityLog.findUnique({ where: { id } })
   if (!existing || existing.userId !== session.userId) {
     return errorResponse('FORBIDDEN', 'Record not found or unauthorized', 403)
   }
   ```
