# AgentIQ - Autonomous Business Intelligence Agent

> **⚠️ Demo Project**: Technical demonstration showcasing agentic AI engineering capabilities for interviews.

An AI agent that autonomously answers business questions by selecting and using multiple tools through a ReAct (Reasoning + Acting) control pattern.

## Key Features

- **🧠 Conversation Memory**: Maintains context across questions ("What was our revenue?" → "And last month?")
- **☁️ Cloud Storage**: Charts automatically uploaded to AWS S3 with shareable URLs
- **🎤 Voice Interface**: Telegram bot with OpenAI Whisper transcription
- **🤖 Autonomous Tool Selection**: Agent chains SQL → Web Search → Charts → Email in single query
- **👥 Team Role Resolution**: Mention "team leader" or "VP" - automatically resolves to correct email

## Tech Stack

- **LLM**: Claude Sonnet 4 (Anthropic API)
- **Control Pattern**: ReAct (Reasoning + Acting) - raw implementation, no frameworks
- **Database**: PostgreSQL (Docker)
- **Cloud**: AWS S3 for chart storage
- **Language**: TypeScript + Node.js
- **6 Tools**: SQL, Chart (Chart.js), Web Search (Tavily), Email, Calculator (Math.js), Monitoring (cAdvisor)

---


## System Architecture
```
                  ┌─────────────────────────────────────┐
                  │            User Interfaces          │
                  ├──────────────────┬──────────────────┤
                  │   CLI Terminal   │  Telegram Bot    │ 
                  │                  │  (Voice/Text)    │                    
                  └──────────┬───────┴────────┬─────────┘
                             │                │
                         Text Query       Voice Message ────► OpenAI Whisper 
                             │                │               (Audio→Text)
                             │                │         
                             │                │
                             ▼                ▼
                 ┌──────────────────────────────────────┐
                 │         AgentIQ Core Agent           │
                 │       (ReAct Control Pattern)        │
                 │   Conversation Memory (Per Session)  │
                 │      Claude Sonnet 4 Reasoning       │
                 └───────────────────┬──────────────────┘
                                     │
         ┌───────────┬───────────┬───┼─────┬───────────┬──────────────┐
         │           │           │         │           │              │
         ▼           ▼           ▼         ▼           ▼              ▼
     ┌────────┐ ┌───────────┐ ┌──────┐ ┌───────┐ ┌──────────┐ ┌────────────┐
     │  SQL   │ │ Web-search│ │ Chart│ │ Email │ │Calculator│ │ Monitoring │
     │  Tool  │ │   Tool    │ │ Tool │ │ Tool  │ │   Tool   │ │    Tool    │
     └───┬────┘ └─────┬─────┘ └───┬──┘ └────┬──┘ └─────┬────┘ └──────┬─────┘
         │            │           │         │          │             │
         ▼            ▼           ▼         ▼          ▼             ▼
     ┌────────┐  ┌────────┐  ┌────────┐  ┌──────┐  ┌─────────┐  ┌──────────┐
     │PostGres│  │ Tavily │  │Chart.js│  │ SMTP │  │ Math.js │  │ cAdvisor │
     └────────┘  └────────┘  │  + S3  │  └──────┘  └─────────┘  └──────────┘
                             └────────┘

```

## Example Workflows

### 1. Complete Autonomous Workflow
```bash
npm start "Compare our AOV to German e-commerce industry, create chart, email to team leader"
```

**Agent autonomously executes:**
1. SQL query for our AOV → $3,262
2. Web search for German benchmark → €120
3. Chart generation with gradients
4. Upload to AWS S3 → \`https://s3.amazonaws.com/...\`
5. Email with chart URL to team leader

### 2. Voice + Telegram
Send voice message: *"Check database container health and email team leader if CPU is high"*

Agent:
- Transcribes via Whisper
- Checks cAdvisor metrics
- Conditionally sends alert email

---

## With Agent vs Without Agent
  *"Compare our AOV to Germany industry, create chart, email to team leader"*

**Without AgentIQ** (Manual Process):
1. Open database client
2. Ask ChatGPT to write SQL query for AOV
3. Copy/paste query, run it → Result
4. Open browser, search "Germany ecommerce AOV 2024"
5. Read articles, extract benchmark
6. Open spreadsheet tool to create comparison chart
7. Export chart as PNG
8. Open Gmail, compose email
9. Attach chart, write message, send

⏱️ **Time: ~15-20 minutes**  

---

**With AgentIQ** (Autonomous):
```bash
npm start "Compare our AOV to Germany industry, create chart, email to team leader"
```
⏱️ **Time: ~30 seconds**  

The agent autonomously executes all 9 steps in a single command.

---

## Future Enhancements (Interview Discussion Points)

- **Redis** for distributed conversation memory
- **LangGraph** for complex multi-agent workflows
- **Streaming responses** for real-time UX
- **Semantic caching** with vector DB (pgvector)
- **Human-in-the-loop** checkpoints for critical actions

---
