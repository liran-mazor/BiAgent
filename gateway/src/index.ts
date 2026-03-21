/**
 * Minimal API Gateway
 *
 * Sits between BiAgent and all downstream A2A agents.
 * Responsibilities:
 *   1. JWT authentication — every /tasks call must carry a valid Bearer token
 *   2. Routing — path prefix maps to upstream agent URL
 *   3. Transparent proxying — strips prefix, forwards body, returns upstream response
 *
 * Route convention:
 *   /:agent/.well-known/agent.json  → public  (service discovery, no auth)
 *   /:agent/tasks                   → private (requires JWT)
 *
 * Adding a new agent = one line in UPSTREAM_AGENTS.
 */

import { config } from 'dotenv';
config({ path: '../.env' });
import { validateEnv } from './validateEnv.js';
validateEnv();

import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const PORT       = parseInt(process.env.GATEWAY_PORT        ?? '3000');
const JWT_SECRET = process.env.JWT_SECRET!;

// ── Route registry ────────────────────────────────────────────────────────────
// Maps /:agent path prefix → upstream base URL.
// Adding a new A2A agent = one entry here.

const UPSTREAM_AGENTS: Record<string, string> = {
  knowledge: process.env.KNOWLEDGE_AGENT_URL ?? 'http://localhost:3001',
};

// ── Auth middleware ───────────────────────────────────────────────────────────
// Verifies the Bearer JWT in the Authorization header.
// Rejects with 401 if missing, malformed, or signed with the wrong secret.

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

// ── Proxy ─────────────────────────────────────────────────────────────────────
// Strips the /:agent prefix and forwards the request to the upstream agent.
// The upstream agent never sees the prefix — its routes stay unchanged.

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

// ── Routes ────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Applied to /tasks only — agent card discovery is exempt.
// Configurable via env: RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS.

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'), // 1 minute
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '60'), // 60 req/min
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders:   false,
  message: { error: 'Too many requests — slow down' },
});

// Agent Card — public, no auth.
// BiAgent calls this at startup for service discovery.
app.get('/:agent/.well-known/agent.json', async (req, res) => {
  const upstream = UPSTREAM_AGENTS[req.params.agent];
  if (!upstream) { res.status(404).json({ error: `Unknown agent: ${req.params.agent}` }); return; }
  await proxy(upstream, '/.well-known/agent.json', req, res);
});

// Tasks — requires valid JWT.
// All agent invocations go through here.
app.post('/:agent/tasks', limiter, authenticate, async (req, res) => {
  const upstream = UPSTREAM_AGENTS[req.params.agent as string];
  if (!upstream) { res.status(404).json({ error: `Unknown agent: ${req.params.agent}` }); return; }
  await proxy(upstream, '/tasks', req, res);
});

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
