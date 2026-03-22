/**
 * 4.10 — End-to-end smoke test
 *
 * Verifies the full event-driven pipeline without any LLM calls:
 *   1. Data pipeline  — POST to services → outbox → Kafka → ClickHouse consumer → ClickHouse
 *   2. RAG pipeline   — POST document to backoffice → Kafka → knowledge-agent → pgvector
 *
 * Prerequisites (must all be running):
 *   docker compose up -d        (Kafka, ClickHouse, PostgreSQL)
 *   npm run init                (topics + schemas — idempotent)
 *   npm run gateway
 *   npm run svc:orders && npm run svc:catalog && npm run svc:customers
 *   npm run svc:backoffice
 *   npm run outbox-worker
 *   npm run consumer            (BiAgent ClickHouse writer)
 *   npm run agent               (knowledge-agent — for RAG pipeline test)
 *
 * Run:
 *   npm run smoke-test
 */

import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { createClient } from '@clickhouse/client';
import { Pool } from 'pg';

// ── Config ────────────────────────────────────────────────────────────────────

const GATEWAY  = process.env.GATEWAY_URL   ?? 'http://localhost:3000';
const POLL_MS  = 1_000;
const TIMEOUT  = 30_000; // 30s for Kafka → ClickHouse round-trip

const token = jwt.sign({ service: 'smoke-test' }, process.env.JWT_SECRET!, { expiresIn: '5m' });

const ch = createClient({
  url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DATABASE ?? 'biagent',
  username: process.env.CLICKHOUSE_USER     ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
});

const pg = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT ?? '5432'),
  user:     process.env.POSTGRES_USER     ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? '',
  database: process.env.POSTGRES_DB       ?? 'postgres',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function post(path: string, body: any): Promise<any> {
  const res = await fetch(`${GATEWAY}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (res.status >= 400) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function postMultipart(path: string, filename: string, content: string): Promise<any> {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);
  const res = await fetch(`${GATEWAY}${path}`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body:    form,
  });
  const data = await res.json();
  if (res.status >= 400) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function pollClickHouse(query: string): Promise<boolean> {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const rs   = await ch.query({ query, format: 'JSONEachRow' });
    const rows = await rs.json<unknown[]>();
    if (rows.length > 0) return true;
    await sleep(POLL_MS);
  }
  return false;
}

async function pollPgVector(source: string): Promise<boolean> {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const { rows } = await pg.query('SELECT 1 FROM rag_documents WHERE source = $1 LIMIT 1', [source]);
    if (rows.length > 0) return true;
    await sleep(POLL_MS);
  }
  return false;
}

function pass(label: string) { console.log(`  ✓  ${label}`); }
function fail(label: string) { console.log(`  ✗  ${label}`); process.exitCode = 1; }

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testDataPipeline(): Promise<void> {
  console.log('\n── Data pipeline (services → Kafka → ClickHouse) ─────────────────');

  // Use timestamps as IDs to avoid conflicts across runs
  const id       = Date.now() % 1_000_000;
  const now      = new Date().toISOString();

  // 1. Create customer
  try {
    await post('/api/customers/customers', {
      id, email: `smoke+${id}@test.com`, name: 'Smoke Test Customer', registeredAt: now,
    });
    pass('POST /api/customers/customers → 201');
  } catch (err: any) {
    fail(`POST /api/customers/customers — ${err.message}`);
    return;
  }

  // 2. Create product
  const productId = id + 1;
  try {
    await post('/api/catalog/products', {
      id: productId, name: 'Smoke Test Widget', category: 'Electronics', price: 49.99, createdAt: now,
    });
    pass('POST /api/catalog/products → 201');
  } catch (err: any) {
    fail(`POST /api/catalog/products — ${err.message}`);
    return;
  }

  // 3. Place order
  const orderId  = id + 2;
  try {
    await post('/api/orders/orders', {
      id: orderId,
      customerId:  id,
      items:       [{ productId, quantity: 2, price: 49.99 }],
      totalAmount: 99.98,
      placedAt:    now,
    });
    pass('POST /api/orders/orders → 201');
  } catch (err: any) {
    fail(`POST /api/orders/orders — ${err.message}`);
    return;
  }

  // 4. Poll ClickHouse — wait for all three tables
  console.log(`\n  Polling ClickHouse (up to ${TIMEOUT / 1000}s)…`);

  const customerOk = await pollClickHouse(`SELECT 1 FROM customers WHERE id = ${id} LIMIT 1`);
  customerOk ? pass('customer arrived in ClickHouse') : fail('customer NOT in ClickHouse (timeout)');

  const productOk = await pollClickHouse(`SELECT 1 FROM products WHERE id = ${productId} LIMIT 1`);
  productOk ? pass('product arrived in ClickHouse') : fail('product NOT in ClickHouse (timeout)');

  const orderOk = await pollClickHouse(`SELECT 1 FROM orders WHERE id = ${orderId} LIMIT 1`);
  orderOk ? pass('order arrived in ClickHouse') : fail('order NOT in ClickHouse (timeout)');

  const itemOk = await pollClickHouse(`SELECT 1 FROM order_items WHERE order_id = ${orderId} LIMIT 1`);
  itemOk ? pass('order_items arrived in ClickHouse') : fail('order_items NOT in ClickHouse (timeout)');
}

async function testRagPipeline(): Promise<void> {
  console.log('\n── RAG pipeline (backoffice → Kafka → knowledge-agent → pgvector) ─');

  const docContent = `# Smoke Test Strategy Document

## Executive Summary

The smoke test validates the complete document ingestion pipeline.
This document exists solely to confirm that event-driven RAG ingestion works end-to-end.

## Key Findings

- The outbox pattern successfully decouples backoffice from knowledge-agent
- Kafka delivers document.uploaded events reliably
- knowledge-agent downloads from S3 and ingests into pgvector automatically
`;

  let s3Key: string;
  try {
    const result = await postMultipart('/api/backoffice/documents', 'smoke-test-strategy.txt', docContent);
    s3Key = result.s3Url ? result.id : null;
    if (!result.id) throw new Error('no id in response');
    // s3Key format: documents/{uuid}.txt
    s3Key = `documents/${result.id}.txt`;
    pass(`POST /api/backoffice/documents → 201 (id: ${result.id})`);
  } catch (err: any) {
    fail(`POST /api/backoffice/documents — ${err.message}`);
    return;
  }

  console.log(`\n  Polling pgvector for source="${s3Key}" (up to ${TIMEOUT / 1000}s)…`);

  const ingestOk = await pollPgVector(s3Key!);
  ingestOk
    ? pass('document chunks arrived in pgvector')
    : fail('document NOT in pgvector (timeout — is knowledge-agent running?)');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\nBiAgent smoke test — 4.10');
  console.log(`  gateway:    ${GATEWAY}`);
  console.log(`  clickhouse: ${process.env.CLICKHOUSE_HOST ?? 'http://localhost:8123'}`);
  console.log(`  postgres:   ${process.env.POSTGRES_HOST ?? 'localhost'}:${process.env.POSTGRES_PORT ?? '5432'}`);

  await testDataPipeline();
  await testRagPipeline();

  await ch.close();
  await pg.end();

  const ok = process.exitCode !== 1;
  console.log(ok ? '\nAll checks passed.' : '\nSome checks failed — see ✗ above.');
}

main().catch(err => {
  console.error('\n[smoke-test] fatal:', err.message);
  process.exit(1);
});
