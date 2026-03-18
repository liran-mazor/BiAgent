export const agentCard = {
  name: "ResearchAgent",
  description: "Searches the web for current information, industry benchmarks, and external data",
  url: "http://localhost:3005",
  version: "1.0.0",
  capabilities: {
    tasks: [
      {
        name: "web_search",
        description: "Search the web for current information, industry benchmarks, statistics, news, or any information not available in the database. Use this when you need external data to compare with internal metrics or answer questions requiring current information.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query to find information on the web"
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return (default: 5)"
            }
          },
          required: ["query"]
        }
      }
    ]
  }
};
