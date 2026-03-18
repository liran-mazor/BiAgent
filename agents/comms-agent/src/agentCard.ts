export const agentCard = {
  name: "CommsAgent",
  description: "Sends emails with optional attachments to team members or external recipients",
  url: "http://localhost:3004",
  version: "1.0.0",
  capabilities: {
    tasks: [
      {
        name: "email",
        description: "Send an email with optional attachments. Use when user requests to send, email, or share results. Recipient can be a role (team_leader, vp) or direct email address.",
        inputSchema: {
          type: "object",
          properties: {
            recipient: {
              type: "string",
              description: "Email address or role (e.g., \"team_leader\", \"vp\", or \"john@company.com\")"
            },
            subject: {
              type: "string",
              description: "Email subject line"
            },
            body: {
              type: "string",
              description: "Email body content"
            },
            attachments: {
              type: "array",
              items: { type: "string" },
              description: "Optional array of file paths to attach"
            }
          },
          required: ["recipient", "subject", "body"]
        }
      }
    ]
  }
};
