# Mobile API Surface Specification

> **Version**: 1.0.0  
> **Base Path**: `/api/mobile/v1`  
> **Protocol**: HTTPS / JSON REST

---

## 1. Overview & Architectural Principles

The Mobile API acts as a thin HTTP adapter layer over Tracker's existing domain application services. It provides standard REST endpoints consumed by the mobile client while reusing existing database services, validations, and ownership enforcement.

### Non-Negotiable Rules
1. **Thin Controller Law**: Route Handlers must contain **no business logic**. They authenticate requests, validate input via Zod, invoke domain services (e.g., `ActivityService`), and map outputs to standard DTOs.
2. **Server-Derived Identity**: Never trust client-supplied `userId`, `ownerId`, or `accountId`. The authenticated user ID is extracted strictly from the verified session.
3. **No Direct Prisma Leakage**: Route responses must never return raw Prisma entities containing internal fields or unmapped database relations. Explicit response DTOs must be returned.

---

## 2. Inventory: Server Actions vs. Mobile Route Handlers

### Web Server Actions Inventory (`app/actions/`)
| File | Domain | Mobile Action Required |
| :--- | :--- | :--- |
| `auth.ts` | Login, Register, Logout | **Yes**: Mobile needs `POST /api/mobile/v1/auth/login` and `GET /api/mobile/v1/auth/me`. |
| `log.ts` | Activity occurrences, status toggles | **Yes**: Core of Activities/Tasks vertical slice (`/api/mobile/v1/activities/logs`). |
| `template.ts`| Habit/Task templates | **Yes**: Needed for mobile daily timeline (`/api/mobile/v1/activities/templates`). |
| `calendar.ts`| Agenda, feed sync | **Future**: Secondary mobile phase. |
| `journal.ts` | Markdown reflections, images | **Future**: Deferred until Activities slice is stable. |
| `leave.ts` | Leave balances, applications | **Future**: Deferred. |
| `weight.ts` | Weight metrics | **Future**: Deferred. |
| `vault.ts` | Zero-knowledge encrypted vault | **Web-Only (for now)**: Complex client-side crypto key derivation. |
| `settings.ts`| User preferences, guest permissions | **Partial**: Mobile can read guest permissions or profile via auth routes. |
| `note.ts` | Quick notes | **Future**: Handled via mobile sync or dedicated endpoint later. |

---

## 3. Global Conventions & Standards

### 3.1 Endpoint Naming & Versioning
- All mobile endpoints reside under the `/api/mobile/v1` path namespace.
- Route paths use lowercase kebab-case for resource collections (e.g., `/activities/templates`, `/activities/logs`).
- Versioning is explicitly indicated in the URI (`v1`). Breaking changes will introduce `v2` without modifying existing `v1` contracts.

### 3.2 Authentication & Authorization
- **Header Format**: `Authorization: Bearer <signed_session_token>`
- **Token Verification**: Tokens are verified using `verifySession(token)` in `lib/session.ts`.
- **Unauthorized Response**: Missing, invalid, or expired tokens return HTTP `401 Unauthorized`.
- **Forbidden Response**: Valid tokens lacking necessary capability (e.g., guest user accessing owner-only resource) return HTTP `403 Forbidden`.

### 3.3 Standard Response Envelope
All endpoints return JSON. Successful mutation responses wrap the resource in a data object:
```json
{
  "success": true,
  "data": { ... }
}
```

### 3.4 Standard Error Envelope
Errors consistently return a standard envelope with no stack traces, SQL errors, or sensitive internal paths:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Activity name is required and must be 200 characters or fewer.",
    "details": {
      "fieldErrors": {
        "name": ["Activity name is required"]
      }
    }
  }
}
```

#### Standard Error Codes
| Code | HTTP Status | Meaning |
| :--- | :--- | :--- |
| `UNAUTHENTICATED` | 401 | Missing or invalid session token. |
| `FORBIDDEN` | 403 | Authenticated user lacks permission or does not own record. |
| `NOT_FOUND` | 404 | Target entity does not exist or has been deleted. |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation. |
| `CONFLICT` | 409 | Concurrent update or unique constraint conflict. |
| `INTERNAL_ERROR` | 500 | Unexpected server error (logged internally, sanitized message returned). |

### 3.5 Idempotency Policy
- For offline-first mutations, the client may supply an optional `clientRequestId` (UUID) or use client-generated entity `id`.
- Handlers perform idempotent operations (e.g., `upsert` or deduplication by `id` / `userId_date`), ensuring network retries and reconnects do not produce duplicate records.

---

## 4. Phase 1 Mobile API Surface (Activities & Tasks Slice)

### 4.1 Authentication

#### `POST /api/mobile/v1/auth/login`
Authenticates a user via username and 4-digit PIN, issuing a signed session token.
- **Request Body**:
  ```json
  {
    "username": "alice",
    "pin": "1234"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "token": "eyJ1c2VySWQiOi...hmacSignature",
      "user": {
        "id": "usr_123456",
        "username": "alice",
        "isOwner": true
      }
    }
  }
  ```

#### `GET /api/mobile/v1/auth/me`
Returns the profile and capabilities of the currently authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "id": "usr_123456",
      "username": "alice",
      "email": "alice@example.com",
      "isOwner": true
    }
  }
  ```

---

### 4.2 Activity Templates (Habits & Tasks)

#### `GET /api/mobile/v1/activities/templates`
Retrieves all active activity templates owned by the authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `activeOnly`: `true | false` (default `true`)
  - `category`: optional string filter
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "templates": [
        {
          "id": "tmpl_987",
          "name": "Morning Workout",
          "category": "fitness",
          "type": "WORKOUT",
          "priority": "HIGH",
          "icon": "Dumbbell",
          "color": "emerald",
          "recurrenceType": "daily",
          "estimatedDuration": 45,
          "isActive": true
        }
      ]
    }
  }
  ```

#### `POST /api/mobile/v1/activities/templates`
Creates a new activity template for the authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**: Validated against `createTemplateSchema`
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "data": {
      "template": {
        "id": "tmpl_988",
        "name": "Read Documentation",
        "category": "learning",
        "recurrenceType": "daily",
        "icon": "Book",
        "color": "blue"
      }
    }
  }
  ```

---

### 4.3 Activity Logs (Occurrences & Completions)

#### `GET /api/mobile/v1/activities/logs`
Retrieves activity logs for a specific date or date range for the authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `date`: `YYYY-MM-DD` (single day lookup)
  - `startDate`: `YYYY-MM-DD` (range lookup)
  - `endDate`: `YYYY-MM-DD` (range lookup)
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "logs": [
        {
          "id": "log_555",
          "activityId": "tmpl_987",
          "date": "2026-09-17",
          "status": "done",
          "note": "Completed 5km run",
          "amount": null,
          "payload": null,
          "updatedAt": "2026-09-17T08:30:00.000Z"
        }
      ]
    }
  }
  ```

#### `POST /api/mobile/v1/activities/logs`
Logs an occurrence (e.g. marking complete, skipped, or recording a value).
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "id": "optional-client-generated-uuid",
    "activityId": "tmpl_987",
    "date": "2026-09-17",
    "status": "done",
    "note": "Completed morning workout",
    "amount": null,
    "payload": null
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "log": {
        "id": "log_555",
        "activityId": "tmpl_987",
        "date": "2026-09-17",
        "status": "done",
        "note": "Completed morning workout"
      }
    }
  }
  ```

#### `PATCH /api/mobile/v1/activities/logs/:id`
Updates an existing activity log entry.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "status": "skipped",
    "note": "Rest day"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "log": { ... }
    }
  }
  ```

#### `DELETE /api/mobile/v1/activities/logs/:id`
Soft-deletes an activity log entry using Universal Soft Delete (`deletedAt = now()`).
- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "deleted": true,
      "id": "log_555"
    }
  }
  ```
