import { z } from 'zod';

// Base tool interface
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: any) => Promise<ToolResult>;
}

// Tool execution result
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
