# Kafka — Implementation Review

## What's Solid

| Pattern | Status | Notes |
|---------|--------|-------|
| Idempotent producer | ✓ | `acks: -1`, `maxInFlightRequests: 1`, exponential backoff |
| Retry/DLQ pattern | ✓ | 5s → 30s → 60s ladder, proper headers, clean separation |
| Consumer group isolation | ✓ | Each listener gets its own group: `{prefix}.{topic}` |
| Graceful shutdown | ✓ | SIGTERM/SIGINT handled, 10s force-exit timeout |
| Atomic outbox writes | ✓ | Entity + outbox row in one Postgres transaction |
| KRaft mode | ✓ | No Zookeeper — modern Kafka (3.7.0) |
| Batch buffer to ClickHouse | ✓ | Flushes on count (100) or timer (5s) |
| Partition strategy | ✓ | Orders: 3 partitions. Low-volume topics: 1 partition |

---

## Issues to Fix

### 1. `fromBeginning: true` on every startup
```ts
await this.consumer.subscribe({ topics: [...], fromBeginning: true });
```
Replays entire topic history on every service restart. Kafka tracks offsets per consumer group — `fromBeginning: true` overrides that and resets to offset 0. Should be `fromBeginning: false` after initial setup.

**In BiAgent:** all listeners set `fromBeginning: true` in `base-listener.ts`. Not a problem for demo (topics are fresh), but will cause full replay on every restart in production.

---

### 2. Retry delay blocks the consumer
```ts
if (remaining > 0) await new Promise(res => setTimeout(res, remaining));
```
While a retry message is sleeping, the consumer is blocked and can't process other messages on that partition. Standard practice: separate retry consumer, or TTL-based delay via topic config (`message.timestamp.type + retention`).

**In BiAgent:** implemented as an inline sleep in `handleMessage()`. Fine for low-volume topics (documents, reviews). For orders with 3 partitions and real volume, this would stall processing.

---

### 3. No DLQ monitoring or alerting
Messages land in `{topic}.dlq` silently. Only a `console.error` log. In production need a consumer watching DLQ topics and triggering alerts.

**In BiAgent:** not implemented. DLQ messages are written with full headers (`error`, `failed-at`, `original-topic`) so they're inspectable — but nothing reads them automatically.

---

### 4. Outbox worker — missing in production
- **Local/demo:** outbox worker removed. Data seeded directly into ClickHouse via `npm run seed-warehouse`. Kafka not involved.
- **K8s:** Debezium deployment is in the manifest (`kafka-connect.yaml`) but the connector is never registered — outbox rows sit in Postgres indefinitely. Events never flow to Kafka, consumers never fire.

**In BiAgent:** the outbox table and atomic writes are correct. The publishing side (outbox → Kafka) is the gap. Fix: register the Debezium connector via the init Job, or add a polling outbox worker.

---

### 5. Single broker in K8s (replication factor 1)
Any broker restart loses unacked messages. Standard production setup: 3 brokers, replication factor 3, min ISR 2.

**In BiAgent:** K8s StatefulSet has 1 replica. Fine for demo. Noted as a known gap.

---

## Concepts to Know

### Partitions = unit of parallelism
More partitions → more consumer instances can run in parallel. Set at topic creation — painful to change later. Plan ahead based on expected throughput.

**In BiAgent:** orders get 3 partitions (highest volume), all others get 1. Retry and DLQ topics get 1 (sequential is fine there).

### Consumer group rebalancing
Triggered when a consumer joins or leaves. Kafka reassigns partitions, causing a processing pause. Cooperative (incremental) rebalancing reduces the blast radius — standard rebalancing stops all consumers in the group.

**In BiAgent:** using default rebalancing (not cooperative). Fine at current scale.

### Hot key problem
If all messages for a topic hash to the same partition key, one consumer gets all the work. Others sit idle. Use a key with high cardinality (customer_id, order_id) or round-robin if order doesn't matter.

**In BiAgent:** messages published without explicit keys → round-robin across partitions. No hot key risk, but also no ordering guarantee per entity.

### Compaction
For topics where only the latest value per key matters. Kafka retains only the most recent message per key — useful for entity state (current product price) not event history (every order placed).

**In BiAgent:** not used. All topics are event-based (append-only), compaction would be wrong here.

### Idempotent consumers
If a consumer crashes after processing but before committing the offset, it will reprocess the message on restart. Consumers must be idempotent — processing the same message twice should produce the same result.

**In BiAgent:** analytics consumers use `INSERT INTO ClickHouse` — ClickHouse's MergeTree deduplicates on insert window. Knowledge-agent uses `DELETE WHERE source = $1` before re-inserting — explicit idempotency. Both are correct.

---

## Priority Order for Production

1. Register Debezium connector (outbox → Kafka flow)
2. `fromBeginning: false`
3. Separate retry consumer (unblock main consumer)
4. DLQ alerting
5. Multi-broker setup (3 brokers, RF=3, minISR=2)
