import 'dotenv/config';
import express from 'express';
import { agentCard } from './agentCard.js';
import { executeEmail } from './emailTool.js';
import { z } from 'zod';

const app = express();
app.use(express.json());

const taskMap: Record<string, Function> = {
  email: executeEmail
};

const taskRequestSchema = z.object({
  task: z.string(),
  input: z.record(z.string(), z.unknown()).optional().default({})
});

app.get('/.well-known/agent.json', (req, res) => {
  res.json(agentCard);
});

app.post('/tasks', async (req, res) => {
  const parsed = taskRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { task, input } = parsed.data;
  const handler = taskMap[task];
  if (!handler) {
    return res.status(400).json({ error: `Unknown task: ${task}` });
  }

  try {
    const result = await handler(input);
    res.json({ status: 'completed', data: result });
  } catch (error: any) {
    res.status(500).json({ status: 'failed', error: error.message });
  }
});

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`📧 CommsAgent running on http://localhost:${PORT}`);
});
