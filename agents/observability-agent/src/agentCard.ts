export const agentCard = {
  name: "ObservabilityAgent",
  description: "Monitors and analyzes agent health — LangSmith traces, latency, token usage, failures, and degradation patterns",
  url: "http://localhost:3002",
  version: "1.0.0",
  capabilities: {
    tasks: [
      {
        name: "query_observability",
        description: "Answer any observability question about recent LangSmith traces — anomalies, token usage, latency trends, failure rates, etc.",
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The observability question to answer (e.g. 'are there any anomalies?', 'what is the average token usage?', 'show me recent failures')"
            },
            limit: {
              type: "number",
              description: "Number of recent traces to analyze (default: 20)"
            }
          },
          required: ["question"]
        }
      }
    ]
  }
};
