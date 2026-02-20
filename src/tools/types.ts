import { z } from 'zod';

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
