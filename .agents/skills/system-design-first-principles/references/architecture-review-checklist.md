# Architecture Review Checklist

Use this checklist to review any application. For each item, capture evidence and express key findings as:

```text
Problem → Constraint → Design choice → Tradeoff → Failure mode → Observability signal
```

## Product Requirements

- Who are the users?
- What critical action must work reliably?
- What must feel instant?
- What can be delayed?
- What must never be wrong?
- What are the explicit non-goals?

## System Boundaries

- What is inside this system?
- What is delegated to third parties?
- Which dependencies are synchronous?
- Which dependencies can fail without blocking users?
- Where are trust boundaries?

## Data Ownership

- What is the source of truth?
- Which service or module owns each entity?
- What data is duplicated for reads?
- How is duplicated data reconciled?
- What data must be archived or deleted?

## APIs

- Are endpoints aligned to product actions?
- Are writes idempotent where retries are possible?
- Is pagination stable?
- Are validation errors consistent?
- Are rate limits defined?
- Are timeout expectations clear?

## Database

- Are entities, indexes, uniqueness constraints, and foreign keys clear?
- Do query patterns match indexes?
- Are migrations safe and reversible where possible?
- Are backups and restore tests defined?
- Is the consistency model explicit?
- What is the first database bottleneck: Central Processing Unit, memory, disk input/output, locks, connections, or storage?

## Cache

- What problem does the cache solve?
- What data is hot?
- What is the time to live?
- How does invalidation work?
- What happens on cold start?
- How is stampede prevented?
- What is the source-of-truth fallback?

## Async Processing

- Which work is outside the interactive latency budget?
- Are jobs idempotent?
- Are retries bounded?
- Is exponential backoff with jitter used?
- Is there a dead letter queue?
- How are poison jobs handled?
- How are queue depth and oldest job age monitored?

## Reliability

- Are timeouts explicit?
- Are circuit breakers needed for failing dependencies?
- Is there a degraded mode?
- How does the system handle partial failure?
- What is the retry budget?
- What is the error budget?

## Security

- How are users authenticated?
- How is authorization enforced?
- Where are secrets stored?
- Is input validation applied at boundaries?
- Are audit logs needed?
- Is sensitive data encrypted in transit and at rest?
- What abuse patterns are expected?

## Observability

- Are logs structured and correlated by request or trace ID?
- Are traces available across synchronous dependencies?
- Are P50, P95, and P99 tracked for critical paths?
- Are traffic, errors, and saturation tracked?
- Are alerts actionable?
- Is there a dashboard for the main user journey?

## Deployment

- How is the system deployed?
- How are environment variables documented?
- How are migrations run?
- How does rollback work?
- Are smoke tests run after deploy?
- Is disaster recovery tested?

## Cost

- What are the main cost drivers?
- Which costs scale with users, requests, storage, or third-party calls?
- What are the budget alerts?
- What data retention policy controls storage growth?
- What can be degraded or sampled under cost pressure?

## Scale Evolution

### 10x

- Which constraint dominates first?
- Are indexes and query patterns still sufficient?
- Does the worker pool need more headroom?
- Do rate limits need adjustment?

### 100x

- Does the database need read replicas, partitioning, archival, or a specialized index?
- Does asynchronous processing need priority queues or better backpressure?
- Does fanout amplify P99?
- Are service boundaries still aligned with ownership?

### 1000x

- Is sharding justified by storage, disk input/output, memory, or Central Processing Unit limits?
- Are streams justified by replay, retention, ordering, or multiple consumers?
- Are regional deployment, edge caching, or data locality required?
- Does the organization need independent deployability through services?
