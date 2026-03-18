export const agentCard = {
  name: "AnalyticsAgent",
  description: "Generates charts and revenue forecasts for business intelligence",
  url: "http://localhost:3003",
  version: "1.0.0",
  capabilities: {
    tasks: [
      {
        name: "chart",
        description: "Generate beautiful, modern charts (bar/line/pie) with gradients, shadows, and data labels as PNG images. Only use this when the user explicitly requests a chart, graph, or visualization.",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["bar", "line", "pie"],
              description: "Chart type"
            },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "Label for this data point" },
                  value: { type: "number", description: "Numeric value for this data point" }
                },
                required: ["label", "value"]
              },
              description: "Array of data points. MUST be an array of objects with label and value properties. Example: [{\"label\": \"Product A\", \"value\": 1000}]"
            },
            title: {
              type: "string",
              description: "Chart title"
            }
          },
          required: ["type", "data"]
        }
      },
      {
        name: "forecast_revenue",
        description: "Forecast future revenue based on historical monthly data using linear trend analysis. Pass historical data as array of {month, revenue} objects.",
        inputSchema: {
          type: "object",
          properties: {
            historicalData: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  month: { type: "string" },
                  revenue: { type: "number" }
                },
                required: ["month", "revenue"]
              }
            },
            monthsAhead: {
              type: "number",
              description: "Number of months to forecast"
            }
          },
          required: ["historicalData", "monthsAhead"]
        }
      }
    ]
  }
};
