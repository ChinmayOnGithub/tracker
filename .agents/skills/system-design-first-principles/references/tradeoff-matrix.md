# Tradeoff Matrix

Use these tables to compare options from constraints. Do not pick a tool because it is popular.

## Monolith Versus Modular Monolith Versus Microservices

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| Monolith | Small product, one team, low operational complexity. | Keep one deployable unit. | Simple deploys, but boundaries can blur. | Tight coupling slows change. | Build time, module dependency graph, defect rate by area. |
| Modular monolith | Product has distinct domains but one team or shared release cadence. | Separate modules inside one deployable app. | Requires discipline at boundaries. | Modules bypass contracts and share internals. | Cross-module imports, test coverage, deploy frequency. |
| Microservices | Independent teams need separate deployability or scaling and failure boundaries. | Split services by ownership and data boundary. | Network tax, partial failure, distributed tracing, versioning. | Cascading failure or data inconsistency. | Service P99, dependency errors, trace fanout, deployment failure rate. |

## SQL Versus NoSQL

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| SQL | Relational data, transactions, constraints, reporting, flexible queries. | Use tables, indexes, transactions, foreign keys where useful. | Schema changes require care. | Lock contention, slow joins, migration risk. | Query latency, lock waits, deadlocks, migration duration. |
| NoSQL | Access patterns are known, scale profile is specialized, flexible documents or key-value access dominate. | Store data by query pattern. | Fewer ad hoc queries and weaker relational guarantees. | Hot partitions, inconsistent duplicates. | Partition load, read/write latency, conflict rate. |

## B-Tree Databases Versus Log-Structured Merge Tree Databases

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| B-Tree | Indexed reads, range scans, transactions, mixed workloads. | Keep sorted index pages for efficient lookups and ranges. | Random write cost and page splits. | Write-heavy workload causes input/output pressure. | Buffer cache hit rate, query P99, disk input/output, lock waits. |
| Log-Structured Merge Tree | Very high write throughput and append-heavy workloads. | Write sequentially, compact later. | Read amplification and compaction cost. | Compaction backlog hurts reads and writes. | Compaction lag, write amplification, read P99, disk utilization. |

## Cache-Aside Versus Write-Through Versus Write-Back

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| Cache-aside | Flexible reads and tolerable staleness. | App reads cache, falls back to database, then fills cache. | Stale data and stampede risk. | Cache miss storm overloads database. | Hit ratio, database read QPS, cache miss P99. |
| Write-through | Reads need fresh cached data after writes. | Write database and cache during write path. | Slower writes and tighter coupling. | Cache failure blocks writes unless fallback exists. | Write latency, cache write errors, stale-read reports. |
| Write-back | Write latency is critical and cache can be durable. | Write cache first, flush to database later. | Data loss risk and complex recovery. | Flush failure loses acknowledged writes. | Flush lag, dirty entries, recovery errors. |

## Queue Versus Stream

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| Queue | Discrete jobs with claim, process, complete semantics. | Workers consume jobs and retry failures. | Limited replay history and fanout. | Poison job blocks or churns retries. | Queue depth, oldest job age, retry count, dead letters. |
| Stream | Immutable event log, replay, retention, ordered history, multiple consumers. | Consumers track offsets over retained events. | More operational complexity. | Consumer lag or schema evolution breaks consumers. | Consumer lag, broker saturation, schema errors, replay duration. |

## Synchronous Versus Asynchronous

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| Synchronous | User needs immediate result or rejection. | Complete work before response. | User latency includes dependency latency. | Slow dependency blocks user flow. | Endpoint P99, downstream span P99, timeout rate. |
| Asynchronous | Work can happen after user confirmation. | Enqueue and process later. | Eventual completion and reconciliation complexity. | Backlog delays or loses side effects. | Queue depth, oldest job age, worker error rate. |

## Range Sharding Versus Hash Sharding Versus Consistent Hashing

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| Range sharding | Range queries and locality matter. | Route records by key range. | Hot ranges overload one shard. | One range receives disproportionate traffic. | Per-shard QPS, hot key range, shard P99. |
| Hash sharding | Even load matters more than range locality. | Hash key to pick shard. | Range queries scatter and resharding is hard. | Cross-shard query cost rises. | Scatter-gather count, per-shard balance, query fanout. |
| Consistent hashing | Nodes change and movement must be limited. | Hash keys and nodes on a ring. | More routing complexity. | Uneven virtual-node distribution creates hotspots. | Rebalance duration, moved keys, per-node load. |

## JSON Versus Protocol Buffers Or FlatBuffers

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| JSON | Human readability, web APIs, flexible integration. | Send text payloads. | Larger payloads and parsing cost. | Central Processing Unit or bandwidth becomes bottleneck. | Payload size, serialization time, CPU profile. |
| Protocol Buffers | Typed contracts, smaller payloads, high-volume services. | Use schema-based binary encoding. | Schema evolution and tooling overhead. | Incompatible schema breaks clients. | Decode errors, version adoption, payload size. |
| FlatBuffers | Very low-latency reads and minimal parsing. | Read binary buffers with less allocation. | More specialized tooling and constraints. | Harder debugging and schema mistakes. | Allocation rate, decode latency, client errors. |

## Strong Consistency Versus Eventual Consistency

| Option | Best when | Design choice | Tradeoff | Failure mode | Observability signal |
| --- | --- | --- | --- | --- | --- |
| Strong consistency | Money, inventory, permissions, uniqueness, legal state. | Require one current truth before acknowledging. | Higher latency or lower availability under partitions. | Lock contention or unavailable writes. | Transaction latency, lock waits, conflict rate. |
| Eventual consistency | Feeds, analytics, search indexes, notifications, derived views. | Accept delayed convergence. | Users may see stale data. | Reconciliation gaps persist. | Replication lag, stale-read rate, reconciliation failures. |
