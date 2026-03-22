/**
 * API Gateway
 *
 * Single entry point for all HTTP traffic in the BiAgent platform.
 *
 * Two registries:
 *   UPSTREAM_AGENTS   — A2A agents (BiAgent internal, JWT auth)
 *   UPSTREAM_SERVICES — Business microservices (external-facing, JWT auth)
 *
 * Route conventions:
 *   GET  /:agent/.well-known/agent.json  → public  (A2A service discovery, no auth)
 *   POST /:agent/tasks                   → private (A2A invocation, JWT required)
 *   ANY  /api/:service/*                  → private (business service proxy, JWT required)
 *
 * Adding a new A2A agent   = one line in UPSTREAM_AGENTS.
 * Adding a new microservice = one line in UPSTREAM_SERVICES.
 */

import { config } from 'dotenv';
config({ path: '../.env' });
import { validateEnv } from './validateEnv.js';
validateEnv();

import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const PORT       = parseInt(process.env.GATEWAY_PORT ?? '3000');
const JWT_SECRET = process.env.JWT_SECRET!;

// ── A2A agent registry ────────────────────────────────────────────────────────
// BiAgent calls these via the A2A protocol (Agent Card + /tasks).

const UPSTREAM_AGENTS: Record<string, string> = {
  knowledge: process.env.KNOWLEDGE_AGENT_URL ?? 'http://localhost:3001',
};

// ── Business service registry ─────────────────────────────────────────────────
// Source-of-truth microservices that receive writes and publish Kafka events.
// Routed under /svc/:service/* to keep A2A and service namespaces separate.

const UPSTREAM_SERVICES: Record<string, string> = {
  orders:     process.env.ORDERS_SERVICE_URL     ?? 'http://localhost:4001',
  catalog:    process.env.CATALOG_SERVICE_URL    ?? 'http://localhost:4002',
  customers:  process.env.CUSTOMERS_SERVICE_URL  ?? 'http://localhost:4003',
  reviews:    process.env.REVIEWS_SERVICE_URL    ?? 'http://localhost:4004',
  backoffice: process.env.BACKOFFICE_SERVICE_URL ?? 'http://localhost:4005',
};

// ── Auth middleware ───────────────────────────────────────────────────────────

function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS      ?? '60000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS   ?? '60'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests — slow down' },
});

// ── Proxy ─────────────────────────────────────────────────────────────────────

async function proxy(upstream: string, path: string, req: Request, res: Response): Promise<void> {
  try {
    const url = `${upstream}${path}`;
    const response = await fetch(url, {
      method:  req.method,
      headers: { 'Content-Type': 'application/json' },
      body:    req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err: any) {
    res.status(502).json({ error: `Upstream unavailable: ${err.message}` });
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// A2A — Agent Card (public, no auth)
app.get('/:agent/.well-known/agent.json', async (req, res) => {
  const upstream = UPSTREAM_AGENTS[req.params.agent];
  if (!upstream) { res.status(404).json({ error: `Unknown agent: ${req.params.agent}` }); return; }
  await proxy(upstream, '/.well-known/agent.json', req, res);
});

// A2A — task invocation (JWT required)
app.post('/:agent/tasks', limiter, authenticate, async (req, res) => {
  const agent = req.params.agent as string;
  const upstream = UPSTREAM_AGENTS[agent];
  if (!upstream) { res.status(404).json({ error: `Unknown agent: ${agent}` }); return; }
  await proxy(upstream, '/tasks', req, res);
});

// Business services — all methods, all paths (JWT required)
// /api/orders/orders    → orders-service:4001/orders
// /api/catalog/products → catalog-service:4002/products
app.all('/api/:service/*', limiter, authenticate, async (req, res) => {
  const service = req.params.service as string;
  const upstream = UPSTREAM_SERVICES[service];
  if (!upstream) { res.status(404).json({ error: `Unknown service: ${service}` }); return; }
  // Strip /api/:service prefix, forward the rest as-is
  const path = req.path.replace(`/api/${service}`, '') || '/';
  await proxy(upstream, path, req, res);
});

// ── Server lifecycle ──────────────────────────────────────────────────────────

const server = app.listen(PORT, () => console.log(`gateway running on port ${PORT}`));

function shutdown(signal: string): void {
  console.log(`\n${signal} received — shutting down`);
  server.close(() => {
    console.log('gateway stopped');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
