import axios from 'axios';

const FORECAST_AGENT_URL = 'http://localhost:3001';

async function discoverWithRetry(): Promise<any> {
  const RETRY_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 2000;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await axios.get(`${FORECAST_AGENT_URL}/.well-known/agent.json`);
      return response.data;
    } catch {
      if (attempt === RETRY_ATTEMPTS) throw new Error(`ForecastAgent not ready after ${RETRY_ATTEMPTS} attempts`);
      console.log(`\n⏳ Waiting for ForecastAgent... (${attempt}/${RETRY_ATTEMPTS})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export async function initializeA2ATools() {
  const agentCard = await discoverWithRetry();

  const a2aTools = agentCard.capabilities.tasks.map((task: any) => ({
    name: task.name,
    description: task.description,
    inputSchema: task.inputSchema,
    execute: async (input: any) => {
      try {
        const response = await axios.post(`${FORECAST_AGENT_URL}/tasks`, { task: task.name, input });
        return { success: true, data: response.data.result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  }));
  return a2aTools;
}