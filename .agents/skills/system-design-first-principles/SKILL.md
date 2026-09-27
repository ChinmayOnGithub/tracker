---
name: system-design-first-principles
description: Use this skill to design, review, or build production-grade software systems from first principles. It is especially useful for Codex or Claude Code when turning a product idea, Product Requirements Document, or existing codebase into a scalable, observable, resilient application.
---

# System Design First Principles

Use this skill when designing, reviewing, scaling, debugging, or implementing software architecture. The goal is to reason from constraints before naming tools.

## Core Rule

Do not jump to tools.

Every meaningful design decision must use this chain:

```text
Problem → Constraint → Design choice → Tradeoff → Failure mode → Observability signal
```

If a component cannot be justified by load, latency, consistency, availability, data size, failure isolation, team ownership, or operational cost, remove it from the design.

## Required Reasoning Order

Follow this order unless the user explicitly asks for a narrower answer.

### A. Product Reality

- Who uses this?
- What critical action do they perform?
- What must feel instant?
- What can be delayed?
- What must never be wrong?

### B. Load Reality

- Read/write ratio.
- Peak traffic.
- Fanout.
- Data growth.
- Expensive operations.
- P50, P95, and P99 latency target.

### C. Constraint Diagnosis

Name the first constraint likely to dominate:

- Central Processing Unit.
- Memory.
- Disk input/output.
- Network.
- Database locks.
- Queue depth.
- Third-party latency.
- Human/team complexity.

### D. Architecture Proposal

- Start with the simplest viable architecture.
- Default to a modular monolith.
- Add cache, queue, search index, object storage, stream, sharding, or microservices only when a named constraint justifies them.
- Explain why simpler alternatives fail at the stated constraint.

### E. Data Model

Define:

- Source of truth.
- Entities.
- Indexes.
- Uniqueness constraints.
- Idempotency keys.
- Archival strategy.
- Data consistency model.

### F. API Design

Include when relevant:

- Endpoints.
- Request and response examples.
- Pagination.
- Rate limits.
- Validation.
- Error shape.
- Idempotent write behavior.

### G. Failure Modes

Cover:

- Retries.
- Timeouts.
- Circuit breakers.
- Exponential backoff.
- Jitter.
- Poison queue handling.
- Dead letter queues.
- Partial failure.
- Degraded mode.

### H. Observability

Specify:

- Logs.
- Metrics.
- Traces.
- Latency percentiles.
- Traffic.
- Errors.
- Saturation.
- Alerts.
- Dashboards.

Track P99 latency, not only average latency.

### I. Production Readiness

Check:

- Security.
- Authentication.
- Authorization.
- Secrets.
- Migrations.
- Deployment.
- Rollback.
- Backups.
- Disaster recovery.
- Cost controls.

### J. Scale Evolution

Describe how the design changes at:

- MVP.
- 10x.
- 100x.
- 1000x.

### K. Final Answer

End every architecture answer with:

```text
The core tradeoff is: ...
```

## Tool Justification Format

When proposing any tool or infrastructure component, use:

```text
Tool: <name>
Problem: <user or system problem>
Constraint: <latency, throughput, data size, consistency, availability, cost, operations, or team ownership>
Design choice: <how the tool addresses the constraint>
Tradeoff: <what gets worse>
Failure mode: <how it breaks>
Observability signal: <metric, log, trace, or alert that proves it is healthy>
```

## Microservice Trap

Microservices are an optimization for people and organizations, not for software execution.

A local function call becoming a network call adds latency, serialization cost, partial failure, versioning, deployment coordination, tracing complexity, and operational overhead. Start with a modular monolith unless one of these is true:

- Separate teams need independent deployability.
- A subsystem has a different scaling profile that materially changes cost or reliability.
- A failure boundary must isolate a high-risk subsystem.
- Data ownership and compliance boundaries require separation.

## Data Has Distance

Data access cost changes by orders of magnitude across L1 cache, L2 cache, memory, SSD, disk, and network. Before adding a distributed component, ask whether the data path moves from local memory to local disk or across the network.

Use this reasoning:

```text
Problem: request is slow
Constraint: data is far from the compute path or requires random disk/network access
Design choice: move hot data closer, precompute, batch, cache, or redesign access pattern
Tradeoff: freshness, memory cost, invalidation complexity, or operational complexity
Failure mode: stale reads, cache stampede, overload when cache is cold
Observability signal: cache hit ratio, P99 latency, database read input/output, network round trips
```

## Tail Latency Amplification

Average latency hides user suffering. P50 describes a normal request. P99 and P99.9 show tail pain.

If one user request fans out to many services, rare slow calls become common slow user experiences. Always name fanout and calculate the operational risk qualitatively:

```text
More downstream calls → higher chance one call is slow → user-visible P99 rises
```

Reduce fanout with batching, request coalescing, denormalized read models, caching, async work, or removing unnecessary service boundaries.

## Async Decision Rule

Use asynchronous processing when work does not need to complete inside the user's interactive latency budget.

Good async candidates:

- Email, notifications, report generation, media processing, enrichment, billing reconciliation, webhook delivery.

Avoid async when:

- The user needs immediate confirmation.
- The system must reject invalid input synchronously.
- Moving work to a queue would hide correctness failures.

Async requires idempotency, retry policy, dead letter handling, queue depth alerts, and replay or reconciliation where correctness matters.

## Cache Decision Rule

Cache only when hot data is unevenly accessed and the source of truth cannot meet the latency or throughput target directly.

- Cache-aside is flexible but can be stale.
- Write-through improves read consistency but slows writes.
- Write-back is fast but risks data loss and requires durable flushing.

Always specify invalidation, time to live, stampede protection, cold-start behavior, and source-of-truth fallback.

## Database Decision Rule

Treat databases as file input/output management systems with query semantics.

- B-Tree databases are strong defaults for indexed reads, range scans, transactions, and relational integrity.
- Log-Structured Merge Tree databases are justified for high write throughput where compaction and read amplification are acceptable.
- Add read replicas for read scaling only after query shape, indexing, connection pooling, and caching are understood.
- Add a search index when text relevance or inverted-index queries dominate.

## Sharding Decision Rule

Do not shard until a single database node's Central Processing Unit, memory, disk input/output, storage, or operational limit is exhausted after reasonable indexing, partitioning, archival, and read scaling.

- Range sharding helps range queries but risks hotspots.
- Hash sharding spreads load but makes range queries and resharding harder.
- Consistent hashing reduces movement when nodes change.

Sharding adds routing, rebalancing, cross-shard query, transaction, backup, and operational complexity.

## Queue Versus Stream Decision Rule

Use a task queue when each job should be processed as a discrete unit of work.

Use a stream when the system needs an immutable ordered log, replay, multiple independent consumers, or event history.

Do not choose Kafka or another streaming platform because "events might be useful later." Choose it when replay, ordering, retention, fanout consumers, or throughput constraints justify the operational cost.

## Production Code Generation Checklist

When generating code for a project:

1. Inspect the current repo structure first.
2. Identify the framework and package manager.
3. Propose architecture before editing.
4. Keep the first implementation simple.
5. Create or update the README.
6. Add environment variable documentation.
7. Add input validation.
8. Add centralized error handling.
9. Add logging.
10. Add tests where possible.
11. Avoid overengineering.
12. Keep deployment simple.
13. Explain what changed and why.

## When Generating Code

- Work with the existing framework, conventions, and package manager.
- Keep modules aligned with product boundaries.
- Make writes idempotent when retries are possible.
- Use explicit timeouts on network calls.
- Validate external input at system boundaries.
- Return consistent error shapes.
- Add structured logs around critical flows.
- Add tests for correctness, validation, idempotency, and failure paths where practical.
- Document required environment variables and local run commands.
- Avoid adding Redis, Kafka, Kubernetes, GraphQL, microservices, sharding, or a new database unless the constraint diagnosis justifies it.

## Reference Loading

Load deeper references only when useful:

- `references/first-principles-briefing.md` for the full reasoning foundation.
- `references/production-readiness-rubric.md` for scoring a system.
- `references/tradeoff-matrix.md` for comparing architecture choices.
- `references/architecture-review-checklist.md` for reviews.
- `references/scaling-laws.md` for Little's Law, Amdahl's Law, tail latency, network tax, and data distance.

Use templates when the user wants a structured deliverable:

- `templates/production-app-design-template.md`
- `templates/architecture-review-template.md`
- `templates/system-design-interview-template.md`
- `templates/prd-to-architecture-template.md`
