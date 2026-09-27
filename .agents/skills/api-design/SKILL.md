---
name: api-design
description: Design consistent, type-safe API contracts, schema validation, standardized error envelopes, pagination, and rate limiting.
---

# API Design Skill

Use this workflow when creating or modifying public or internal APIs (REST, RPC, Server Actions).

## 1. Contract Design Checklist
1. **Schema Validation**:
   - Parse all request payloads, query parameters, and route arguments with strict schemas (e.g. Zod).
   - Strip unknown fields and return actionable field-level validation errors on 400 Bad Request.
2. **Consistent Response Envelopes**:
   - Use standardized response shapes across all endpoints:
     ```typescript
     // Success
     { success: true, data: { ... } }
     // Error
     { success: false, error: "Human explanation", code: "RESOURCE_NOT_FOUND" }
     ```
3. **Pagination & Filtering**:
   - Collections exceeding 50 items must support pagination (prefer cursor-based for dynamic data, offset for static).
   - Return pagination metadata: `{ total, limit, cursor, hasMore }`.
4. **Idempotency**:
   - Mutating endpoints (`POST`, `PUT`, `DELETE`) subject to network retries should support `Idempotency-Key` headers.
5. **Rate Limiting & Headers**:
   - Protect public endpoints with rate limiting; return `429 Too Many Requests` with `Retry-After` header.
