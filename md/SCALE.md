# Scaling Reference

## Server Side (stateless services)

- **HPA** — scale pods horizontally on CPU/memory/custom metrics (RPS, queue depth). Requires resource requests/limits set on every pod.
- **Resource requests/limits** — prerequisite for HPA and for the scheduler to place pods correctly.
- **Pod Disruption Budgets** — guarantee minimum pods alive during rolling deploys or node drain.
- **Readiness/liveness probes** — traffic only hits healthy pods; failed pods pulled from rotation automatically.
- **Topology spread constraints** — spread pods across nodes so all replicas don't land on the same machine.

**In BiAgent:** all 7 service YAMLs have `resources.requests` and `resources.limits` set. All have readiness probes (delay 5s, period 5s) and liveness probes (delay 15s, period 10s, threshold 3). HPA not configured — all deployments run 1 replica. PodDisruptionBudgets and topology spread constraints not implemented. Good foundation, not yet production-scaled.

---

## Kafka Side

- **Partition count** — the unit of parallelism. More partitions = more consumers can run in parallel. Set at topic creation, painful to change later — plan ahead.
- **Consumer group scaling** — add consumer instances up to partition count, Kafka rebalances automatically. Beyond partition count, extra consumers sit idle.
- **Rebalancing** — triggered when a consumer joins or leaves the group. Kafka reassigns partitions, causing a processing pause. Cooperative (incremental) rebalancing reduces the blast radius.
- **Broker scaling** — add brokers to the StatefulSet, then explicitly reassign partitions across brokers (`kafka-reassign-partitions`). Not automatic.
- **Replication factor** — each partition has N replicas across brokers. Lose a broker, no data loss. Min 3 brokers for production.
- **Hot key** — if all messages hash to the same partition, one consumer gets all the load. Use high-cardinality keys or round-robin.
- **Compaction** — for topics where only the latest value per key matters. Kafka retains only the most recent message per key.
- **Tiered storage** — offload old log segments to S3, brokers only keep recent data hot. Reduces broker disk requirements significantly.
- **MirrorMaker 2** — replicate topics across clusters for multi-region or disaster recovery setups.

**In BiAgent:** orders topic has 3 partitions (highest volume), all others have 1. Single broker in K8s (replication factor 1) — fine for demo, not for production. Messages published without explicit keys → round-robin, no hot key risk. No cooperative rebalancing, no tiered storage, no MirrorMaker. See KAFKA.md for full review.

---

## Database Side — PostgreSQL

- **Read replicas** — stream WAL to replicas, route read-heavy queries there. Writes still go to primary. Good first scaling step.
- **Connection pooling (PgBouncer)** — Postgres handles ~100–200 connections before degrading. PgBouncer sits in front and multiplexes thousands of app connections into a small pool.
- **Partitioning** — range/hash partition large tables (e.g. orders by month). Improves query performance and makes old data easy to archive.
- **Vertical scaling** — larger instance first. Usually gets you very far before sharding becomes necessary.
- **Citus extension** — horizontal sharding across multiple Postgres nodes, transparent to the application layer.

**In BiAgent:** Postgres serves two purposes — OLTP (microservices) and pgvector (RAG). Single instance, no read replicas, no PgBouncer. Each service uses its own `pg.Pool` (connection pooling at the app level). Postgres schema includes the outbox table and service tables — partitioning not applied to orders or customers. Fine at demo scale. PgBouncer would be the first addition at real load.

---

## Database Side — ClickHouse

- **Already done: `PARTITION BY toYYYYMM`** — foundation for partition pruning on time-range queries. Most analytics queries filter by date, so only relevant partitions are scanned.
- **Sharding** — distribute data across multiple ClickHouse nodes, queries run in parallel across shards.
- **Replication** — ReplicatedMergeTree engine copies data across replicas via ClickHouse Keeper.
- **ClickHouse Keeper** — coordinates distributed operations, replaces the old ZooKeeper dependency.
- **Distributed table engine** — sits on top of shards, routes queries automatically. App queries the distributed table, not individual shards.
- **Materialized views** — pre-aggregate heavy queries at insert time. Query the view instead of scanning raw tables.

**In BiAgent:** partitioning by month already implemented for orders and reviews — the most important scaling foundation. Single ClickHouse node, no replication, no sharding. Batch buffer flushes at 100 rows or 5s — reduces write amplification. MergeTree engine handles deduplication on merge. No materialized views yet — would be the next step for common aggregation queries (monthly revenue by category, top products).

---

## BiAgent Orchestrator Scaling

The orchestrator is stateful per conversation (message history in memory). This limits naive horizontal scaling.

- **Current:** single process, all conversations in memory. Works for demo.
- **Scale path:** externalize conversation state to Redis (keyed by conversationId). Multiple orchestrator instances can then handle any conversation.
- **Prompt cache:** Anthropic's prompt cache is per-connection — if load balancing across instances, cache hit rate drops. Sticky sessions (route same user to same instance) preserve cache efficiency.
- **Circuit breaker state:** currently in-process (`openCircuits: Set<string>`). In multi-instance deployment, each instance has independent state — one instance sees a circuit open, another doesn't. Fix: shared circuit breaker state in Redis.

**In BiAgent:** single instance, all state in memory. The architecture is correct for demo. The gaps above are the scale path.
