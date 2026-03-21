export interface A2AAgentConfig {
  url: string;
}

export const a2aAgents: A2AAgentConfig[] = [
  { url: `http://localhost:${process.env.KNOWLEDGE_AGENT_PORT ?? '3001'}` },
];
