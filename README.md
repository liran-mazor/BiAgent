# AgentIQ - Autonomous Business Intelligence Agent

An AI agent that autonomously answers business questions by selecting and using multiple tools through a ReAct (Reasoning + Acting) control pattern.

## What It Does

AgentIQ connects to your e-commerce database and autonomously decides which tools to use to answer complex business questions. It can query databases, search the web for benchmarks, generate charts, and send email reports - all from a single natural language query.

## Tech Stack

- **LLM**: Claude Sonnet 4 (Anthropic API)
- **Control Pattern**: ReAct (Reasoning + Acting loop)
- **Database**: PostgreSQL (Docker)
- **Language**: TypeScript + Node.js
- **Tools**: SQL queries, Chart generation, Web search, Email

## Quick Setup

1. **Clone and install:**
```bash
git clone <your-repo-url>
cd agentIQ
npm install
```

2. **Setup environment variables** (`.env`):
```env
ANTHROPIC_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

3. **Start PostgreSQL:**
```bash
docker-compose up -d
```

4. **Seed database:**
```bash
npm run seed
```

5. **Run a query:**
```bash
npm start "How many customers do we have?"
```

## Example Usage
```bash
npm start "Show me the top 5 products by revenue as a bar chart"
```

The agent will autonomously:
1. Query the database for product revenue
2. Generate a professional chart
3. Return insights with visualization

