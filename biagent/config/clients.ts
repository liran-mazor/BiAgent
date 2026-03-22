import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createClient } from '@clickhouse/client';
import { wrapOpenAI } from 'langsmith/wrappers';
import { wrapSDK } from 'langsmith/wrappers';

export const anthropic = wrapSDK(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }));
export const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }));

export const clickhouse = createClient({
  url:      process.env.CLICKHOUSE_HOST     ?? 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DATABASE ?? 'biagent',
  username: process.env.CLICKHOUSE_USER     ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
});
