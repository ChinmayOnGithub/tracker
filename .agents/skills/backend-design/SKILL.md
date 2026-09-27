---
name: backend-design
description: Design clean layered backend systems, domain services, transaction boundaries, idempotent workers, and robust data access layers.
---

# Backend Design Skill

Use this workflow when creating API servers, microservices, background job workers, or backend domain modules.

## 1. Architectural Checklist
1. **Layer Separation**:
   - Controller / Route Handler: Input validation, session authorization, status formatting.
   - Domain Service: Pure business rules, invariants, state transitions.
   - Data Repository: Isolated database interactions, queries, and transactions.
2. **Transaction Boundaries**:
   - Wrap multi-table state modifications in explicit database transactions.
   - Keep transactions short to prevent lock contention.
3. **Idempotency**:
   - Ensure mutating endpoints accept and enforce idempotency keys where retries can happen.
   - Reference `docs/engineering/IDEMPOTENCY.md`.
4. **Structured Logging and Telemetry**:
   - Attach correlation `traceId` to all log statements.
   - Reference `docs/engineering/OBSERVABILITY.md`.
5. **Graceful Shutdown**:
   - Listen for `SIGTERM` and `SIGINT` to drain in-flight connections before process exit.
