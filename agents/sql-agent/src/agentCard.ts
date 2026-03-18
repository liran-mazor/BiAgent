export const agentCard = {
  name: "SqlAgent",
  description: "Executes SQL SELECT queries against the PostgreSQL business database",
  url: "http://localhost:3001",
  version: "1.0.0",
  capabilities: {
    tasks: [
      {
        name: "query_database",
        description: "Execute a SELECT SQL query against the PostgreSQL database. Returns query results as JSON array.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "SQL SELECT query to execute"
            }
          },
          required: ["query"]
        }
      }
    ]
  }
};
