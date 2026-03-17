import { A2ATool } from './types.js';

const OBSERVABILITY_AGENT_URL = process.env.OBSERVABILITY_AGENT_URL || 'http://localhost:3003';

async function fetchAgentCardWithRetry(url: string): Promise<any> {
  const RETRY_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch agent card: ${response.statusText}`);
      return await response.json();
    } catch {
      if (attempt === RETRY_ATTEMPTS) throw new Error(`A2A agent not ready after ${RETRY_ATTEMPTS} attempts`);
      console.log(`\n⏳ Waiting for A2A agent ... (${attempt}/${RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export async function initializeA2ATools(): Promise<A2ATool[]> {
  try {
    const agentCard = await fetchAgentCardWithRetry(`${OBSERVABILITY_AGENT_URL}/.well-known/agent.json`);
    return agentCard.capabilities.tasks.map((task: any) => ({
      name: task.name,
      description: task.description,
      inputSchema: task.inputSchema,
      execute: async (input: any) => {
        const res = await fetch(`${OBSERVABILITY_AGENT_URL}/tasks`, {
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
  } catch (error: any) {
    // A2A is optional — agent continues with native + MCP tools if unavailable
    console.warn(`⚠️  ObservabilityAgent unavailable: ${error.message}`);
    return [];
  }
}
