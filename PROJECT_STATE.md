# AgentIQ - Project State Documentation

## Overview
AgentIQ is an autonomous Business Intelligence Agent built using a ReAct (Reasoning + Acting) control pattern. It answers business questions by autonomously deciding which tools to use, executing them, and providing insights from an e-commerce database.

**Tech Stack:**
- Node.js + TypeScript
- Claude API (Sonnet 4)
- PostgreSQL (Docker)
- Chart.js (for visualizations)

---

## Current Implementation Status

### ✅ Completed Components

#### 1. Infrastructure
- **Database:** PostgreSQL running in Docker container
  - Container name: `agentiq-db`
  - Port: 5432
  - Credentials: agentiq/agentiq123
  - 5 tables: customers, products, orders, order_items, reviews
  - Seeded with 100 customers, 50 products, 200 orders, 150 reviews

- **Project Structure:**
```
agentIQ/
├── src/
│   ├── database/
│   │   ├── schema.sql
│   │   └── seed.ts
│   ├── tools/
│   │   ├── types.ts
│   │   ├── sql-tool.ts
│   │   ├── chart-tool.ts
│   │   └── index.ts
│   ├── agent/
│   │   ├── agent.ts (ReAct loop)
│   │   ├── prompts.ts
│   └── index.ts (CLI entry point)
│   └── interactive.ts (interactive mode)
├── charts/ (generated chart images)
├── docker-compose.yml
├── .env (ANTHROPIC_API_KEY)
└── package.json
```

#### 2. Tools (2 of 5 implemented)

**SQL Tool:**
- Executes SELECT queries on database
- Security: Only allows SELECT queries
- Returns query results with row count

**Chart Tool:**
- Generates PNG bar/line/pie charts using chartjs-node-canvas
- Saves to `charts/` directory
- Handles JSON string parsing from Claude API
- Returns filepath for downstream use (e.g., email attachment)

#### 3. Agent Core (ReAct Loop)
- **Class:** `AgentIQ` in `src/agent/agent.ts`
- **Max iterations:** 10 (prevents infinite loops)
- **Flow:**
  1. Sends question + available tools to Claude
  2. Claude decides: tool use OR final answer
  3. If tool use → execute → feed result back → loop
  4. If final answer → return to user
- **Zod integration:** Runtime validation of tool parameters
- **Error handling:** Recovers from tool failures, continues reasoning

#### 4. CLI Interface
- **Single question mode:** `npm start "your question"`
- **Interactive mode:** `npm run interactive` (continuous Q&A)

---

## Database Schema

```sql
-- Customers
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Order Items
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL
);

-- Reviews
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## How It Works - ReAct Loop Explained

### Example Flow:
```
User: "What are the top 5 products by revenue? Show me a bar chart."

Iteration 1:
→ Claude thinks: "I need sales data"
→ Uses sql_tool with query
→ Gets results: [{product_name: "Small Concrete Shirt", total_revenue: 32833.06}, ...]

Iteration 2:
→ Claude thinks: "User asked for bar chart, I have data"
→ Uses chart_tool with type="bar" and data array
→ Chart saved to charts/chart_1768934702863.png

Iteration 3:
→ Claude thinks: "I have answer and visualization"
→ Returns final answer with insights

Done!
```

### Key Technical Details:

**Zod Schema Conversion:**
- Tools define parameters using Zod schemas
- Agent converts Zod → JSON Schema for Claude API
- Runtime validation ensures Claude's tool calls are properly formatted

**Tool Result Format:**
```typescript
interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
```

**Chart Data Format Issue & Solution:**
- Claude API stringifies nested JSON
- Chart tool receives: `"[{\"label\": \"X\", \"value\": 100}]"` (string)
- Solution: Parse JSON string before Zod validation
- System prompt explicitly instructs Claude on correct format

---

## NPM Scripts

```json
{
  "seed": "tsx src/database/seed.ts",           // Seed database with fake data
  "start": "tsx src/index.ts",                  // Run single question
  "interactive": "tsx src/interactive.ts"       // Interactive Q&A mode
}
```

---

## Dependencies

**Core:**
- `@anthropic-ai/sdk` - Claude API client
- `pg` - PostgreSQL client
- `zod` - Runtime schema validation
- `dotenv` - Environment variables

**Chart Generation:**
- `chartjs-node-canvas` - Generate PNG charts
- `chart.js` - Charting library
- `canvas` - Node canvas implementation

**Data Generation:**
- `@faker-js/faker` - Generate fake e-commerce data

**Dev:**
- `typescript`, `tsx`, `@types/node`, `@types/pg`

---

## 📝 TODO - Next Implementation Phase

### 1. Add 3 More Tools

**Calculator Tool:**
- Purpose: Complex math/statistics (averages, percentages, growth rates)
- Use case: "What's the average order value?" or "Calculate 30% increase"
- Parameters: `expression` (string math expression)
- Library: `mathjs` or custom evaluator

**Date/Time Tool:**
- Purpose: Date calculations, formatting, time ranges
- Use case: "Show sales from last quarter" or "What day was 90 days ago?"
- Parameters: `operation` (enum), `date` (string), `format` (string)
- Library: `date-fns` or native Date

**Text Analysis Tool:**
- Purpose: Sentiment analysis on product reviews
- Use case: "What's the sentiment of reviews for product X?"
- Parameters: `text` (string) or `review_ids` (array)
- Library: `sentiment` npm package or simple keyword matching

### 2. Add Email Tool

**Email Tool:**
- Purpose: Send charts/reports to colleagues
- Use case: "Email this chart to john@company.com"
- Parameters: 
  - `to` (email string)
  - `subject` (string)
  - `body` (string)
  - `attachments` (array of filepaths - from chart tool output)
- Library: `nodemailer`
- Configuration: SMTP credentials in .env

**Integration flow:**
```
User: "Show top products as chart and email it to sarah@company.com"
→ sql_tool → chart_tool (returns filepath) 
→ email_tool (uses filepath as attachment)
→ Final answer: "Chart generated and emailed to sarah@company.com"
```

### 3. Update System Prompt

When new tools are added, update `src/agent/prompts.ts`:

```typescript
export const SYSTEM_PROMPT = `You are AgentIQ, an AI business intelligence assistant.

Available tools:
- sql_tool: Query database
- chart_tool: Generate visualizations (bar/line/pie)
- calculator_tool: Perform calculations
- datetime_tool: Date/time operations
- text_analysis_tool: Analyze review sentiment
- email_tool: Send reports via email

[Rest of prompt...]
`;
```

### 4. Upgrade Chart Library (Optional Enhancement)

**Current:** Basic Chart.js with fixed colors
**Future:** 
- Customizable color schemes
- Multiple datasets (grouped bar charts)
- Annotations and data labels
- SVG output option
- Interactive HTML charts

---

## Configuration Files

### .env
```
ANTHROPIC_API_KEY=sk-ant-your_key_here
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    container_name: agentiq-db
    environment:
      POSTGRES_USER: agentiq
      POSTGRES_PASSWORD: agentiq123
      POSTGRES_DB: agentiq
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
volumes:
  postgres-data:
```

### .gitignore
```
node_modules/
.env
charts/
dist/
```

---

## Testing Commands

**Database verification:**
```bash
# Connect to database
docker exec -it agentiq-db psql -U agentiq -d agentiq

# Check top products
docker exec -it agentiq-db psql -U agentiq -d agentiq -c "
SELECT p.name, SUM(oi.quantity * oi.price) as revenue 
FROM products p 
JOIN order_items oi ON p.id = oi.product_id 
GROUP BY p.name 
ORDER BY revenue DESC 
LIMIT 5;"
```

**Agent testing:**
```bash
# Single question
npm start "How many customers do we have?"

# Chart generation
npm start "Show top 5 products by revenue as a pie chart"

# Interactive mode
npm run interactive
```

---

## Known Issues & Solutions

### Issue 1: Chart Data Format
**Problem:** Claude sends data as JSON string instead of array
**Solution:** Parse JSON string in chart-tool.ts before validation

### Issue 2: Tool Description Clarity
**Problem:** Claude auto-used chart_tool even when not requested
**Solution:** Updated description to "Only use when user explicitly requests visualization"

### Issue 3: Zod Schema → JSON Schema Conversion
**Problem:** `.shape()` not a function error
**Solution:** Access `._def.shape` as property, not method call

---

## Interview Talking Points

**Agentic AI Concepts:**
- ReAct pattern: Reasoning (thinking) + Acting (tool use) in loops
- Autonomous decision-making: Claude chooses which tools to use
- Error recovery: Agent continues reasoning even when tools fail
- Tool composition: Chaining tools (SQL → Chart → Email)

**Technical Decisions:**
- **Zod for validation:** Runtime safety when LLM outputs are unpredictable
- **Docker for PostgreSQL:** Isolated, reproducible environment
- **Raw SQL over ORM:** Shows SQL understanding, less abstraction
- **PNG charts:** Portable, can be emailed or embedded

**Scalability Considerations:**
- Tool registry pattern: Easy to add new tools
- Max iterations: Prevents runaway costs
- Connection pooling: PostgreSQL pool for concurrent requests
- Modular design: Agent core separate from tools/database

---

## Next Steps for New Chat

1. **Implement Calculator Tool** - for math operations
2. **Implement Date/Time Tool** - for temporal queries  
3. **Implement Text Analysis Tool** - for review sentiment
4. **Implement Email Tool** - for sending reports
5. **Update SYSTEM_PROMPT** - document all 6 tools
6. **Test end-to-end workflow** - "Generate report and email it"
7. **(Optional) Add web API** - Express REST endpoint for `/ask`

---

## Architecture Diagram

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │ Question
       ▼
┌─────────────────────────────────────┐
│         AgentIQ (ReAct Loop)        │
│  ┌───────────────────────────────┐  │
│  │  1. Send question + tools     │  │
│  │  2. Claude decides action     │  │
│  │  3. Execute tool              │  │
│  │  4. Feed result back          │  │
│  │  5. Repeat until answer       │  │
│  └───────────────────────────────┘  │
└──────┬──────────────────────────────┘
       │ Tool Calls
       ▼
┌─────────────────────────────────────┐
│           Tool Registry             │
│  ┌──────────┐  ┌──────────────┐    │
│  │ SQL Tool │  │  Chart Tool  │    │
│  └────┬─────┘  └──────┬───────┘    │
│       │               │             │
│       ▼               ▼             │
│  ┌──────────┐   ┌─────────────┐   │
│  │PostgreSQL│   │charts/*.png │   │
│  └──────────┘   └─────────────┘   │
└─────────────────────────────────────┘
```

---

## Key Files to Reference in New Chat

1. **Tool Interface:** `src/tools/types.ts` - Shows tool structure
2. **SQL Tool:** `src/tools/sql-tool.ts` - Reference for new tools
3. **Chart Tool:** `src/tools/chart-tool.ts` - Shows JSON parsing pattern
4. **Agent Core:** `src/agent/agent.ts` - ReAct loop implementation
5. **System Prompt:** `src/agent/prompts.ts` - Needs updating with new tools

---

**Current State:** ✅ Core agent working with 2 tools (SQL + Chart)
**Next Phase:** Add 3 more tools + Email tool + Update prompts
**Goal:** Full-featured BI agent for technical interviews
