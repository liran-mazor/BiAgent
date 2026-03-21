export interface A2AAgentConfig {
  url: string;
}

// All A2A traffic routes through the gateway.
// Gateway URL uses /:agent prefix convention — gateway strips it before forwarding.
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';

export const a2aAgents: A2AAgentConfig[] = [
  { url: `${GATEWAY_URL}/knowledge` },
];
