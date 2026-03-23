import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { wrapOpenAI } from 'langsmith/wrappers';
import { wrapSDK } from 'langsmith/wrappers';

export const anthropic = wrapSDK(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }));
export const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }));
