# ADR 0004: Domain Service Abstraction Layer

## Context & Problem Statement
Direct database access or API fetch blocks from Next.js server actions or UI pages make it difficult to mock, test, or substitute implementations (e.g. replacing Google APIs with Microsoft APIs, or direct SQL calls with repository mocks).

## Decision
Introduce a dedicated domain Service Layer.
* Database operations and third-party API clients are encapsulated inside domain service classes (e.g., `GoogleCalendarService`).
* React Server Actions or API routes act as thin controller wrappers that only parse inputs, verify user sessions, and call the service classes.
* Components never call third-party APIs directly.

## Consequences
* **Positives**: Simplifies writing isolated unit tests, enforces modular boundaries, and keeps controllers thin and readable.
* **Negatives**: Marginally increases file count.
