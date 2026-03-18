export interface A2AAgentConfig {
  url: string;
}

export const a2aAgents: A2AAgentConfig[] = [
  { url: process.env.SQL_AGENT_URL           || 'http://localhost:3001' },
  { url: process.env.OBSERVABILITY_AGENT_URL || 'http://localhost:3002' },
  { url: process.env.ANALYTICS_AGENT_URL     || 'http://localhost:3003' },
  { url: process.env.COMMS_AGENT_URL         || 'http://localhost:3004' },
  { url: process.env.RESEARCH_AGENT_URL      || 'http://localhost:3005' },
];
