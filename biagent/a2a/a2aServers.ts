export interface A2AAgentConfig {
  name: string;
  url: string;
  toolNames: string[];  // known tool names — used to pre-open circuits when agent is unreachable
}

// Direct agent URLs — no gateway layer.
// In local demo: agents run on their own ports.
// In K8s: Kong routes externally, internal service URLs used here.
const KNOWLEDGE_URL = process.env.KNOWLEDGE_URL ?? 'http://localhost:3001';
const ANALYTICS_URL = process.env.ANALYTICS_URL ?? 'http://localhost:3002';

export const a2aAgents: A2AAgentConfig[] = [
  { name: 'knowledge', url: KNOWLEDGE_URL, toolNames: ['query_knowledge'] },
  { name: 'analytics', url: ANALYTICS_URL, toolNames: ['query_analytics'] },
];
