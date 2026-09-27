# Production Readiness Rubric

Score each category from 0 to 5. A production-grade system usually needs no category below 3, and critical systems should target 4 or 5 in reliability, security, observability, and data correctness.

## Scoring Key

| Score | Meaning |
| --- | --- |
| 0 | Missing or actively dangerous. |
| 1 | Mentioned but not designed. |
| 2 | Partially designed, with obvious gaps. |
| 3 | Acceptable for MVP or internal production with known risks. |
| 4 | Strong production design with clear tradeoffs. |
| 5 | Mature, tested, observable, and operationally proven. |

## Categories

| Category | 0 | 3 | 5 |
| --- | --- | --- | --- |
| Architecture simplicity | Tool-driven diagram with no constraint reasoning. | Simple modular architecture with a few justified components. | Minimal architecture that directly maps product boundaries to constraints and can evolve without rewrite. |
| Latency awareness | No latency targets. | P50, P95, and P99 targets for critical paths. | Latency budgets per dependency, fanout control, timeout policy, and tail-latency dashboards. |
| Throughput handling | No traffic assumptions. | Read/write ratio, peak traffic, and worker capacity estimated. | Capacity model covers bursts, backpressure, queue depth, autoscaling lag, and load tests. |
| Data model correctness | Entities are vague. | Source of truth, indexes, uniqueness, and relationships are clear. | Data invariants, migrations, archival, restore, and reconciliation are designed and tested. |
| Consistency design | Claims "real time" without semantics. | Defines strong versus eventual consistency per workflow. | Consistency choices have idempotency, conflict handling, replay, and audit strategy. |
| Failure handling | Assumes happy path. | Timeouts, retries, and degraded modes exist for key dependencies. | Retry budgets, backoff, jitter, circuit breakers, poison job handling, dead letters, and recovery drills are defined. |
| Observability | Logs only or nothing. | Metrics, logs, traces, and alerts for critical flows. | Golden signals, business metrics, dependency spans, SLOs, error budgets, and actionable runbooks. |
| Security | Auth mentioned only. | Authentication, authorization, secrets, validation, and audit logs. | Threat model, least privilege, key rotation, data classification, abuse controls, and incident response. |
| Deployment maturity | Manual deploys with no rollback. | Repeatable deploy, environment config, migrations, and rollback path. | Progressive delivery, smoke tests, rollback automation, migration safety, and disaster recovery testing. |
| Cost control | No cost awareness. | Names major cost drivers and expected growth. | Unit economics, budget alerts, capacity headroom, data retention, and scale-stage cost plan. |
| Maintainability | Tightly coupled code and unclear ownership. | Modular boundaries and clear operational docs. | Stable contracts, ownership, tests, architectural decision records, and low-friction local development. |

## Review Procedure

For each category:

1. Name the current score.
2. Cite the evidence.
3. Explain the highest-risk gap.
4. Give one practical improvement.
5. Tie the improvement to an observability signal.

Example:

```text
Category: Failure handling
Score: 2
Evidence: workers retry failed jobs, but there is no retry budget or dead letter queue.
Risk: poison jobs can block useful work and hide data loss.
Improvement: add bounded retries with exponential backoff, jitter, dead letter queue, and replay tooling.
Observability signal: retry count, dead letter queue depth, oldest job age, worker success rate.
```
