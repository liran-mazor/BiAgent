import jwt from 'jsonwebtoken';
import { A2ATool } from './types.js';
import { A2AAgentConfig } from './a2aServers.js';
import { markCircuitOpen } from '../utils/circuitBreaker.js';

const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

// ── JWT ───────────────────────────────────────────────────────────────────────
// Signs a short-lived token for each A2A call.
// In K8s: Kong verifies this against the consumer credential provisioned via admin API.
// In local demo: agents are called directly — no auth enforced, header is omitted.

function generateToken(): string | null {
  const secret = process.env.ECOMMERCE_JWT_SECRET;
  if (!secret) return null;  // local demo mode — no auth
  return jwt.sign({ iss: 'biagent' }, secret, { expiresIn: '5m' });
}

// ── Agent Card discovery ──────────────────────────────────────────────────────

async function fetchAgentCardWithRetry(url: string, agentName: string): Promise<any> {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch agent card: ${response.statusText}`);
      return await response.json();
    } catch {
      if (attempt === RETRY_ATTEMPTS) throw new Error(`not ready after ${RETRY_ATTEMPTS} attempts`);
      console.log(`⏳ [a2aClient] ${agentName} waiting ... (${attempt}/${RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

// ── Tool initialization ───────────────────────────────────────────────────────

export async function initializeA2ATools(agents: A2AAgentConfig[]): Promise<A2ATool[]> {
  const allTools: A2ATool[] = [];

  await Promise.all(agents.map(async ({ name: agentName, url, toolNames }) => {
    try {
      const agentCard = await fetchAgentCardWithRetry(`${url}/.well-known/agent.json`, agentName);
      const tools: A2ATool[] = agentCard.capabilities.tasks.map((task: any) => ({
        name: task.name,
        description: task.description,
        input_schema: task.input_schema,
        execute: async (input: any) => {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const token = generateToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch(`${url}/tasks`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ task: task.name, input }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '(unreadable)');
            throw new Error(`A2A task failed: ${res.statusText} — ${body}`);
          }
          return res.json();
        },
      }));
      allTools.push(...tools);
    } catch (error: any) {
      console.warn(`⚠️  [a2aClient] ${agentName} unavailable — ${error.message}`);
      for (const toolName of toolNames) {
        markCircuitOpen(toolName);
      }
    }
  }));

  return allTools;
}
