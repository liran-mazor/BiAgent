import { A2ATool } from './types.js';
import { A2AAgentConfig } from './a2aServers.js';

const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

async function fetchAgentCardWithRetry(url: string): Promise<any> {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch agent card: ${response.statusText}`);
      return await response.json();
    } catch {
      if (attempt === RETRY_ATTEMPTS) throw new Error(`A2A agent not ready after ${RETRY_ATTEMPTS} attempts`);
      console.log(`\n⏳ Waiting for A2A agent at ${url} ... (${attempt}/${RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export async function initializeA2ATools(agents: A2AAgentConfig[]): Promise<A2ATool[]> {
  const allTools: A2ATool[] = [];

  await Promise.all(agents.map(async ({ url }) => {
    try {
      const agentCard = await fetchAgentCardWithRetry(`${url}/.well-known/agent.json`);
      const tools: A2ATool[] = agentCard.capabilities.tasks.map((task: any) => ({
        name: task.name,
        description: task.description,
        inputSchema: task.inputSchema,
        execute: async (input: any) => {
          const res = await fetch(`${url}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task: task.name, input })
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '(unreadable)');
            throw new Error(`A2A task failed: ${res.statusText} — ${body}`);
          }
          return res.json();
        }
      }));
      allTools.push(...tools);
    } catch (error: any) {
      console.warn(`⚠️  A2A agent unavailable at ${url}: ${error.message}`);
    }
  }));

  return allTools;
}
