# Scaling Laws

Scaling laws help explain why systems fail under load. Use them to reason about cause and effect before choosing infrastructure.

## Little's Law

Formula:

```text
in-flight work = arrival rate × time in system
```

If a service receives 500 requests per second and each request takes 100 milliseconds, the service has about 50 requests in flight.

If latency rises to 2 seconds at the same arrival rate, the service has about 1,000 requests in flight. That consumes more memory, sockets, database connections, worker threads, and Central Processing Unit. A latency problem can become a saturation problem.

Practical use:

- Watch in-flight requests, queue depth, and connection pool usage.
- Reduce time in system by moving non-critical work async.
- Add backpressure before memory and connection pools collapse.

Decision chain:

```text
Problem: memory rises during traffic spikes
Constraint: latency increases, so in-flight requests accumulate
Design choice: add timeouts, cap concurrency, shed low-priority work, and move slow side effects async
Tradeoff: some requests are rejected or delayed
Failure mode: bad concurrency cap can reduce useful throughput
Observability signal: in-flight requests, P99 latency, queue depth, memory usage
```

## Amdahl's Law

Amdahl's Law says total speedup is limited by the serial part of the workload.

If 30 percent of a request must happen serially, making the remaining 70 percent very fast still cannot make the whole request more than about 3.3x faster.

Practical use:

- Find the serial critical path before parallelizing.
- Remove unnecessary synchronous dependencies.
- Cache or precompute serial work if correctness allows.
- Avoid splitting services if network calls lengthen the serial path.

## Tail Latency Amplification

Tail latency gets worse with fanout. If a request calls many dependencies, the user waits for the slowest required dependency.

Example:

```text
One product page calls inventory, pricing, reviews, recommendations, shipping, ads, and personalization.
```

Even if each dependency is usually fast, one slow dependency can make the whole page slow. The more calls, the more likely one is in its tail.

Practical use:

- Keep the interactive critical path small.
- Use deadlines and timeouts.
- Make optional sections degradable.
- Batch calls where possible.
- Cache or precompute derived views.
- Track downstream spans and endpoint P99 together.

## The Knee Of The Curve

As utilization approaches 100 percent, queue wait time rises sharply. This is the knee of the curve.

A system at 50 percent utilization often has room for bursts. A system at 90 to 95 percent utilization may look efficient but can collapse under small bursts, garbage collection, lock contention, or downstream slowness.

Practical use:

- Keep headroom for critical workloads.
- Autoscale before saturation, not after.
- Use admission control when overload begins.
- Prioritize critical requests over optional work.

## Network Tax

A network call is not just a function call. It can involve:

- Domain Name System lookup.
- Border Gateway Protocol route behavior.
- Anycast edge routing.
- Transport Layer Security handshake.
- Load balancer hop.
- Serialization and deserialization.
- Kernel sockets and buffers.
- Retries and timeouts.
- Partial failure.

Practical use:

- Avoid turning local module calls into network calls without an organizational or scaling reason.
- Set explicit timeouts.
- Track dependency latency by percentile.
- Use request IDs and traces across boundaries.
- Consider binary formats only when payload size or serialization Central Processing Unit is a measured bottleneck.

## Data Distance

Data access cost grows as data moves farther away:

```text
CPU cache → memory → local SSD → local disk → same-zone network → cross-zone network → cross-region network
```

Each move adds latency and failure probability.

Practical use:

- Keep hot data close to compute when freshness allows.
- Use indexes to avoid scanning cold data.
- Precompute expensive views.
- Archive cold data away from hot tables.
- Avoid cross-region synchronous writes unless correctness requires them.

## Applying The Laws

When a system slows down:

1. Identify whether the symptom is latency, throughput, errors, or saturation.
2. Find whether the bottleneck is Central Processing Unit, memory, disk input/output, network, locks, queue depth, or third-party latency.
3. Use the smallest design change that attacks the bottleneck.
4. Name the tradeoff and monitor the observability signal that proves whether the fix works.
