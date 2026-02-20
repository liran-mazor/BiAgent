import axios from 'axios';

const FORECAST_AGENT_URL = 'http://localhost:3001';

export async function discoverForecastAgent() {
  try {
    const response = await axios.get(`${FORECAST_AGENT_URL}/.well-known/agent.json`);
    return response.data;
  } catch (error: any) {
    throw new Error(`Failed to discover ForecastAgent at ${FORECAST_AGENT_URL}: ${error.message}`);
  }
}

export async function initializeA2ATools() {
  const agentCard = await discoverForecastAgent();
  console.log(`Agent card was discovered: ${agentCard.name}`);
  
  const a2aTools = agentCard.capabilities.tasks.map((task: any) => ({
    name: task.name,
    description: task.description,
    inputSchema: task.inputSchema,
    execute: async (input: any) => {
      try {
        const response = await axios.post(`${FORECAST_AGENT_URL}/tasks`, {
          task: task.name,
          input
        });
        return { success: true, data: response.data.result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  }));
  console.log(`${agentCard.name} tools were discovered and registered: ${a2aTools.map((tool: any) => tool.name).join(', ')}`);
  return a2aTools;
}
