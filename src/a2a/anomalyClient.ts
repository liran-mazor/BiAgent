import { A2ATool } from './types.js';

const ANOMALY_AGENT_URL = process.env.ANOMALY_AGENT_URL || 'http://localhost:3003';

export async function initializeA2ATools(): Promise<A2ATool[]> {
  try {
    const response = await fetch(`${ANOMALY_AGENT_URL}/.well-known/agent.json`);
    if (!response.ok) throw new Error(`Failed to fetch agent card: ${response.statusText}`);

    const agentCard = await response.json();

    return agentCard.capabilities.tasks.map((task: any) => ({
      name: task.name,
      description: task.description,
      inputSchema: task.inputSchema,
      execute: async (input: any) => {
        const res = await fetch(`${ANOMALY_AGENT_URL}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: task.name, input })
        });
        if (!res.ok) throw new Error(`A2A task failed: ${res.statusText}`);
        return res.json();
      }
    }));
  } catch (error: any) {
    console.warn(`⚠️  AnomalyDetectorAgent unavailable: ${error.message}`);
    return [];
  }
}
